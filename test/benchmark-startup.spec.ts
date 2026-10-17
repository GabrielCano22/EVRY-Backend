import { join } from 'node:path';
import { closeBenchmarkServer, startBenchmarkServer, type BenchmarkStartupEvent } from './helpers/benchmark-process';

const root = join(process.cwd(), 'test/fixtures/benchmark-startup');
function start(mode: string, events: BenchmarkStartupEvent[], deadline = performance.now() + 30_000) {
  return startBenchmarkServer({ root, databaseUrl: `postgresql://127.0.0.1/${mode}`, deadline,
    onPhase: (event) => events.push(event) });
}

describe('real benchmark child startup protocol', () => {
  it('waits through phase and unknown packets, reporting only allowlisted parent-clock diagnostics', async () => {
    const events: BenchmarkStartupEvent[] = [];
    const server = await start('ready', events);
    try {
      expect(server.baseUrl).toBe('http://127.0.0.1:4000');
      expect(events.map((event) => event.phase)).toEqual([
        'FORK_STARTED', 'IMPORTS_STARTED', 'IMPORTS_READY', 'APP_CREATED', 'LISTENING', 'READY',
      ]);
      expect(events.every((event) => Number.isFinite(event.elapsedMs) && event.elapsedMs >= 0)).toBe(true);
      expect(JSON.stringify(events)).not.toContain('SYNTHETIC_PRIVATE');
    } finally { await closeBenchmarkServer(server.child); }
    expect(server.child.exitCode).toBe(0);
  });

  it('classifies initialization rejection without leaking error payloads and closes the actual child', async () => {
    const events: BenchmarkStartupEvent[] = [];
    await expect(start('reject', events)).rejects.toMatchObject({
      code: 'INITIALIZATION_REJECTED', closedCleanly: true, childExitCode: 0,
      message: 'Benchmark startup failed: INITIALIZATION_REJECTED',
    });
    expect(events.map((event) => event.phase)).toContain('INITIALIZATION_REJECTED');
    expect(JSON.stringify(events)).not.toContain('SYNTHETIC_PRIVATE');
  });

  it('preserves an early nonzero exit instead of replacing it with a generic cleanup failure', async () => {
    const events: BenchmarkStartupEvent[] = [];
    await expect(start('exit', events)).rejects.toMatchObject({
      code: 'EXITED_BEFORE_READY', closedCleanly: false, childExitCode: 7,
    });
    expect(events.map((event) => event.phase)).toContain('EXITED_BEFORE_READY');
  });

  it('does not let unknown or phase-only packets cancel the original remaining startup deadline', async () => {
    const events: BenchmarkStartupEvent[] = [];
    await expect(start('wait', events, performance.now() + 1500)).rejects.toMatchObject({
      code: 'STARTUP_TIMEOUT', closedCleanly: true, childExitCode: 0,
    });
    expect(events.map((event) => event.phase)).toContain('STARTUP_TIMEOUT');
    expect(JSON.stringify(events)).not.toContain('SYNTHETIC_PRIVATE');
  });

  it('rejects an exhausted overall deadline without opening a child', async () => {
    const events: BenchmarkStartupEvent[] = [];
    await expect(start('ready', events, performance.now() - 1)).rejects.toMatchObject({
      code: 'DEADLINE_EXHAUSTED', childExitCode: null,
    });
    expect(events).toEqual([]);
  });
});
