import { fork, type ChildProcess, type ForkOptions } from 'node:child_process';
import { join } from 'node:path';

export interface BenchmarkStartupEvent { phase: string; elapsedMs: number }

type StartupFailureCode = 'DEADLINE_EXHAUSTED' | 'STARTUP_TIMEOUT' | 'EXITED_BEFORE_READY' | 'INITIALIZATION_REJECTED' | 'SPAWN_FAILED';
const workerPhases = new Set(['IMPORTS_STARTED', 'IMPORTS_READY', 'APP_CREATED', 'LISTENING']);

export class BenchmarkStartupError extends Error {
  closedCleanly = false;
  childExitCode: number | null = null;
  constructor(readonly code: StartupFailureCode, readonly events: BenchmarkStartupEvent[]) {
    super(`Benchmark startup failed: ${code}`);
  }
}

export async function startBenchmarkServer(options: {
  root: string; databaseUrl: string; deadline: number;
  onPhase?: (event: BenchmarkStartupEvent) => void;
}): Promise<{ child: ChildProcess; baseUrl: string }> {
  const { root, databaseUrl, deadline } = options;
  if (performance.now() >= deadline) throw new BenchmarkStartupError('DEADLINE_EXHAUSTED', []);
  const started = performance.now();
  const events: BenchmarkStartupEvent[] = [];
  const recorded = new Set<string>();
  const record = (phase: string) => {
    // Fixed, deduplicated phase names and a parent clock only. No raw IPC fields.
    if (recorded.has(phase)) return;
    recorded.add(phase);
    const event = { phase, elapsedMs: performance.now() - started };
    events.push(event);
    options.onPhase?.(event);
  };
  // Node24 forwards this spawn option; the installed Node20 declarations omit it.
  const childOptions: ForkOptions & { windowsHide: boolean } = {
    cwd: root, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
    env: { ...process.env, DATABASE_URL: databaseUrl, EVRY_BENCHMARK_STARTUP_TRACE: 'true' },
  };
  const child = fork(join(root, 'scripts/benchmark-api-server.cjs'), [], childOptions);
  record('FORK_STARTED');
  try {
    const baseUrl = await new Promise<string>((resolve, reject) => {
      const detach = () => {
        clearTimeout(timer);
        child.removeListener('exit', exit);
        child.removeListener('error', spawnError);
        child.removeListener('message', message);
      };
      const fail = (code: StartupFailureCode) => {
        detach();
        record(code);
        reject(new BenchmarkStartupError(code, [...events]));
      };
      const exit = () => fail('EXITED_BEFORE_READY');
      const spawnError = () => fail('SPAWN_FAILED');
      const message = (value: unknown) => {
        if (typeof value !== 'object' || value === null) return;
        const packet = value as { phase?: unknown; ready?: unknown; error?: unknown };
        if (typeof packet.phase === 'string' && workerPhases.has(packet.phase)) record(packet.phase);
        if (typeof packet.ready === 'string' && packet.ready.length) {
          detach();
          record('READY');
          resolve(packet.ready);
        } else if (packet.error) fail('INITIALIZATION_REJECTED');
      };
      // Phase/unknown packets never clear or extend this existing watchdog.
      const timer = setTimeout(() => fail('STARTUP_TIMEOUT'), Math.min(30_000, deadline - performance.now()));
      child.once('exit', exit);
      child.once('error', spawnError);
      child.on('message', message);
    });
    return { child, baseUrl };
  } catch (error) {
    const failure = error instanceof BenchmarkStartupError ? error : new BenchmarkStartupError('SPAWN_FAILED', [...events]);
    try { await closeBenchmarkServer(child); failure.closedCleanly = true; }
    catch { failure.closedCleanly = false; }
    failure.childExitCode = child.exitCode;
    throw failure;
  }
}

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
