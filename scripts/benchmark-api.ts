import assert from 'node:assert/strict';
import { execFileSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { join, relative } from 'node:path';
import { hash } from 'bcrypt';
import { Client } from 'pg';
import { assertLocalMigrationDatabase } from '../test/helpers/migration-rehearsal';
import { measureScenario, type ScenarioOptions } from '../test/helpers/api-benchmark';
import { BenchmarkStartupError, closeBenchmarkServer, startBenchmarkServer, type BenchmarkStartupEvent } from '../test/helpers/benchmark-process';
import type { ExercisePageDto } from '../src/modules/exercises/dto/exercise-page.dto';
import type { ProgressOverviewDto, ExerciseProgressDto } from '../src/modules/progress/dto/progress-response.dto';

const root = process.cwd();
const email = 'synthetic-performance@example.test';
const password = randomUUID();

async function main() {
  // Compliant warmed workloads can require ~788s plus migration/startup.
  // Keep the outer watchdog later, leaving time to close and write evidence.
  const deadline = performance.now() + 20 * 60_000;
  // Check before any connection, schema operation or filesystem report.
  const testUrl = assertLocalMigrationDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
  const database = `evry_performance_test_${randomUUID().replaceAll('-', '')}`;
  const target = new URL(testUrl); target.pathname = `/${database}`; target.search = '';
  const admin = new Client({ connectionString: testUrl, connectionTimeoutMillis: 10_000, query_timeout: 30_000 });
  let fixture: Client | undefined;
  let server: ChildProcess | undefined;
  const results: Array<ReturnType<typeof measureScenario> extends Promise<infer T> ? T & { name: string; repetition: number } : never> = [];
  const errors: string[] = [];
  const startupTraces: Array<{ concurrency: number; repetition: number; events: BenchmarkStartupEvent[] }> = [];
  let startupFailure: { code: string; closedCleanly: boolean; childExitCode: number | null; events: BenchmarkStartupEvent[] } | null = null;
  let closedServers = 0;
  let directory: string | undefined;
  let stage = 'safe fixture initialization';
  try {
    await admin.connect();
    // Identifier generated here; never accept an existing target database name.
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
    mkdirSync(join(root, '.worktrees'), { recursive: true });
    directory = mkdtempSync(join(root, '.worktrees/api-performance-'));
    stage = 'schema migration';
    execFileSync(process.execPath, [join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: root, env: { ...process.env, DATABASE_URL: target.href },
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000,
    });
    fixture = new Client({ connectionString: target.href, connectionTimeoutMillis: 10_000, query_timeout: 30_000 });
    await fixture.connect();
    stage = 'synthetic dataset construction';
    await fixture.query('INSERT INTO "User" (id,email,"passwordHash",name,"updatedAt") VALUES ($1,$2,$3,$4,now())',
      ['benchmark-user', email, await hash(password, 12), 'Synthetic benchmark']);
    await fixture.query(`INSERT INTO "Exercise" (id,name,"muscleGroup",equipment)
      SELECT 'benchmark-exercise-'||i, 'Synthetic exercise '||lpad(i::text,4,'0'), 'CHEST', 'BARBELL'
      FROM generate_series(1,2648) AS i`);
    await fixture.query(`INSERT INTO "Workout" (id,"userId",name,"startedAt","endedAt",status,"updatedAt")
      SELECT 'benchmark-workout-'||i, 'benchmark-user', 'Synthetic session '||i,
        '2026-09-01T12:00:00Z'::timestamptz - i * interval '1 day' - interval '1 hour',
        '2026-09-01T12:00:00Z'::timestamptz - i * interval '1 day', 'COMPLETED', now()
      FROM generate_series(1,1000) AS i`);
    await fixture.query(`INSERT INTO "WorkoutSet" (id,"workoutId","exerciseId","order","weightKg",reps,"completedAt","updatedAt")
      SELECT 'benchmark-set-'||i||'-'||j, 'benchmark-workout-'||i, 'benchmark-exercise-1', j, 60, 10,
        '2026-09-01T11:30:00Z'::timestamptz - i * interval '1 day', now()
      FROM generate_series(1,1000) AS i CROSS JOIN generate_series(1,10) AS j`);
    const counts = await fixture.query(`SELECT (SELECT count(*)::int FROM "Exercise") exercises,
      (SELECT count(*)::int FROM "Workout") workouts, (SELECT count(*)::int FROM "WorkoutSet") sets`);
    assert.deepEqual(counts.rows[0], { exercises: 2648, workouts: 1000, sets: 10000 });

    for (const concurrency of [1, 4]) for (let repetition = 1; repetition <= 3; repetition++) {
      stage = `application startup c${concurrency} r${repetition}`;
      const events: BenchmarkStartupEvent[] = [];
      startupTraces.push({ concurrency, repetition, events });
      const started = await startBenchmarkServer({ root, databaseUrl: target.href, deadline,
        onPhase: (event) => events.push(event) });
      server = started.child;
      try {
        stage = `mobile login c${concurrency} r${repetition}`;
        const login = await fetch(`${started.baseUrl}/api/v1/auth/mobile/login`, {
          method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000),
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
        });
        assert.equal(login.status, 200, 'Synthetic login must succeed');
        const tokens = await login.json() as { accessToken: string };
        assert.equal(typeof tokens.accessToken, 'string');
        const common = { baseUrl: started.baseUrl, token: tokens.accessToken, samples: 80, warmup: 20, concurrency, deadline };
        const scenarios: Array<Partial<ScenarioOptions> & Pick<ScenarioOptions, 'path' | 'budgetMs' | 'validate'> & { name: string }> = [
          { name: 'catalog-page-30', path: '/api/v1/exercises?limit=30', budgetMs: 500, validate(value) {
            const data = value as ExercisePageDto;
            assert.equal(data.total, 2648); assert.equal(data.items.length, 30); assert.equal(data.hasMore, true);
          } },
          { name: 'progress-overview-all', path: '/api/v1/progress/overview?period=all', budgetMs: 500, validate(value) {
            const data = value as ProgressOverviewDto;
            assert.equal(data.summary.sessionsCompleted, 1000); assert.equal(data.summary.volumeKg, 6000000);
            assert.equal(data.summary.activeDays, 1000); assert.equal(data.recentWorkouts.length, 5);
            assert.equal(data.comparison, null);
          } },
          { name: 'exercise-history-page-20', path: '/api/v1/progress/exercises/benchmark-exercise-1?period=all&limit=20', budgetMs: 500, validate(value) {
            const data = value as ExerciseProgressDto;
            assert.equal(data.summary.sessionsCount, 1000); assert.equal(data.summary.workingSetsCount, 10000);
            assert.equal(data.summary.volumeKg, 6000000); assert.equal(data.history.total, 1000);
            assert.equal(data.history.items.length, 20); assert.equal(data.history.hasMore, true);
            assert.ok(data.history.nextCursor); assert.ok(data.points.length > 0 && data.points.length <= 120);
          } },
          { name: 'profile-update', path: '/api/v1/users/me', method: 'PATCH', body: { name: 'Synthetic benchmark updated' }, budgetMs: 300, validate(value) {
            assert.equal((value as { name: string }).name, 'Synthetic benchmark updated');
          } },
          { name: 'readiness-upsert', path: '/api/v1/readiness/checkin', method: 'POST', status: 201,
            body: { sleepHrs: 8, stress: 1, soreness: 1, motivation: 5 }, budgetMs: 300, validate(value) {
              assert.equal((value as { score: number }).score, 100);
            } },
        ];
        for (const scenario of scenarios) {
          stage = `${scenario.name} c${concurrency} r${repetition}`;
          results.push({ ...await measureScenario({ ...common, ...scenario }), name: scenario.name, repetition });
        }
      } finally { await closeBenchmarkServer(server); server = undefined; closedServers++; }
    }
    stage = 'final source-integrity verification';
    const final = await fixture.query(`SELECT (SELECT count(*)::int FROM "Readiness") readiness,
      (SELECT count(*)::int FROM "WorkoutSet") sets`);
    assert.deepEqual(final.rows[0], { readiness: 1, sets: 10000 });
  } catch (error) {
    if (error instanceof BenchmarkStartupError) {
      startupFailure = { code: error.code, closedCleanly: error.closedCleanly,
        childExitCode: error.childExitCode, events: error.events };
    }
    const failure = error instanceof BenchmarkStartupError ? error.code : error instanceof Error ? error.name : 'unknown error';
    errors.push(`Benchmark failed during ${stage} (${failure}); do not certify this run.`);
  } finally {
    // Closing resources precedes report IO; a full disk must not leave servers running.
    if (server) { try { await closeBenchmarkServer(server); closedServers++; } catch { errors.push('Application cleanup failed'); } }
    if (fixture) { try { await fixture.end(); } catch { errors.push('Fixture connection cleanup failed'); } }
    try { await admin.end(); } catch { errors.push('Administrative connection cleanup failed'); }
  }
  if (!directory) throw new Error('Benchmark could not initialize a safe local fixture');
  const reportPath = join(directory, 'report.json');
  writeFileSync(reportPath, JSON.stringify({
    schemaVersion: 1, timestamp: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    application: 'compiled AppModule/configureApp; separate process', node: process.version,
    host: { platform: platform(), release: release(), architecture: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem() },
    fixtureDatabase: database, fixture: { exercises: 2648, workouts: 1000, sets: 10000 },
    scope: 'Warm local synthetic application; not deployed API, cold start, Web Vitals or Android release acceptance.',
    assumptions: 'One-sided binomial order-statistic confidence bound assumes independent stationary observations. Shared resources/concurrency may violate assumptions. Each process repetition reported separately; no samples pooled. Rate limits remain enabled.',
    errors, startupTraces, startupFailure, closedServers, results,
  }, null, 2));
  process.stdout.write(JSON.stringify({ report: relative(root, reportPath) }) + '\n');
  if (errors.length || results.length !== 30 || results.some((result) => !result.acceptedWith95Confidence)) process.exitCode = 1;
}

void main().catch(() => { process.stderr.write('Local synthetic API benchmark failed; no acceptance claimed.\n'); process.exitCode = 1; });
