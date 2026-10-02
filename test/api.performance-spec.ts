import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('compiled API performance evidence with real synthetic PostgreSQL', () => {
  it('produces exact validated scenarios with separate warmed confidence reports', () => {
    const run = spawnSync(process.execPath, ['-r', 'ts-node/register', 'scripts/benchmark-api.ts'], {
      cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 22 * 60_000,
    });
    expect(run.status).toBe(0);
    const output = JSON.parse(run.stdout.trim()) as { report: string };
    const report = JSON.parse(readFileSync(join(process.cwd(), output.report), 'utf8'));
    expect(report).toMatchObject({ fixture: { exercises: 2648, workouts: 1000, sets: 10000 },
      errors: [], application: 'compiled AppModule/configureApp; separate process', closedServers: 6 });
    expect(report.results).toHaveLength(30);
    for (const result of report.results) {
      expect(result).toMatchObject({ samples: 80, warmup: 20, acceptedWith95Confidence: true });
      expect(result.observationsMs).toHaveLength(80);
      expect(result.confidenceCoverage).toBeGreaterThanOrEqual(.95);
    }
  }, 23 * 60_000);
});
