import type { ChildProcess } from 'node:child_process';

export async function closeBenchmarkServer(child: ChildProcess, graceMs = 10_000, forceGraceMs = 5000): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    if (child.exitCode === 0) return;
    throw new Error('Benchmark application already exited abnormally');
  }
  if (!child.pid) throw new Error('Benchmark application process was not started');
  await new Promise<void>((resolve, reject) => {
    let forced = false;
    let timer: ReturnType<typeof setTimeout>;
    const closed = (code: number | null) => {
      clearTimeout(timer);
      if (forced) reject(new Error('Benchmark application required forced termination'));
      else if (code === 0) resolve();
      else reject(new Error('Benchmark application exited abnormally'));
    };
    child.once('close', closed);
    timer = setTimeout(() => {
      forced = true;
      // SIGTERM is handled by the worker and can hang in app.close(); SIGKILL
      // cannot be caught. Wait for close, not merely kill() returning true.
      child.kill('SIGKILL');
      timer = setTimeout(() => {
        child.removeListener('close', closed);
        reject(new Error('Benchmark application failed to exit after forced termination'));
      }, forceGraceMs);
    }, graceMs);
    if (child.connected) child.send('close', (error) => {
      if (error && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    });
  });
}
