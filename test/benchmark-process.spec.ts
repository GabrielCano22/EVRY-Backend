import { fork, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { closeBenchmarkServer } from './helpers/benchmark-process';

describe('benchmark actual child shutdown', () => {
  const children: ChildProcess[] = [];
  async function start(mode: string) {
    const child = fork(join(process.cwd(), 'test/fixtures/benchmark-shutdown-child.cjs'), [mode], {
      execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    children.push(child);
    await new Promise<void>((resolve, reject) => {
      child.once('message', () => resolve());
      child.once('error', reject);
      child.once('exit', () => reject(new Error('Fixture child exited before ready')));
    });
    return child;
  }
  afterEach(async () => {
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      await new Promise<void>((resolve) => { child.once('exit', () => resolve()); child.kill('SIGKILL'); });
    }
    children.length = 0;
  });

  it('waits for actual graceful process exit', async () => {
    const child = await start('graceful');
    await closeBenchmarkServer(child, 2000, 2000);
    expect(child.exitCode).toBe(0);
    expect(child.connected).toBe(false);
  });

  it('kills an unresponsive child, waits for exit and invalidates the run', async () => {
    const child = await start('hang');
    await expect(closeBenchmarkServer(child, 50, 2000)).rejects.toThrow(/forced termination/i);
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    expect(child.connected).toBe(false);
  });
});
