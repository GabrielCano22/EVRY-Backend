import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { assertLocalMigrationDatabase, buildPgToolCommand } from './helpers/migration-rehearsal';

const root = process.cwd();
const tables = ['User', 'Exercise', 'Routine', 'RoutineExercise', 'Workout', 'WorkoutSet', 'CycleEntry', 'Readiness', 'RefreshToken'];
const allTables = [...tables, 'ExerciseStat'];
const migrations = readdirSync(join(root, 'prisma/migrations')).filter((name) => /^\d+_/.test(name)).sort();
const legacyMigrations = migrations.filter((name) => name <= '20260813190000_add_routine_series_plan');
type Snapshot = Record<string, unknown[]>;
type Columns = Record<string, string[]>;

describe('populated migration and recovery rehearsal (synthetic local databases only)', () => {
  let source: Client;
  let sourceUrl: string;
  let admin: Client;
  let testUrl: string;
  let directory: string;
  let legacyConfig: string;
  let before: Snapshot;
  let beforeColumns: Columns;
  let legacyDump: Buffer;
  const clients: Client[] = [];
  const databases: string[] = [];

  function deploy(url: string, config = join(root, 'prisma.config.ts')): string {
    return execFileSync(process.execPath, [join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', config], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url },
      encoding: 'utf8',
      timeout: 90_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  function pgTool(tool: 'pg_dump' | 'pg_restore', url: string, args: string[], input?: Buffer): Buffer {
    const command = buildPgToolCommand(tool, url, args);
    return execFileSync(command.file, command.args, { env: command.env, input, timeout: 30_000, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  }

  async function createDatabase(): Promise<{ client: Client; url: string }> {
    const name = `evry_migration_test_${randomUUID().replaceAll('-', '')}`;
    // The identifier is generated here; never accept a target name from environment/user input.
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    databases.push(name);
    const url = new URL(testUrl);
    url.pathname = `/${name}`;
    url.search = '';
    const client = new Client({ connectionString: url.href });
    clients.push(client);
    await client.connect();
    return { client, url: url.href };
  }

  async function columns(client: Client, names = allTables): Promise<Columns> {
    const result: Columns = {};
    for (const table of names) {
      const rows = await client.query<{ column_name: string }>('SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position', ['public', table]);
      result[table] = rows.rows.map((row) => row.column_name);
    }
    return result;
  }

  async function snapshot(client: Client, selected: Columns): Promise<Snapshot> {
    const result: Snapshot = {};
    for (const [table, fields] of Object.entries(selected)) {
      const rows = await client.query<{ row: unknown }>(`SELECT to_jsonb(projection) AS row FROM (SELECT ${fields.map((field) => `"${field}"`).join(', ')} FROM "${table}") projection ORDER BY to_jsonb(projection)::text`);
      result[table] = rows.rows.map((row) => row.row);
    }
    return result;
  }

  async function restore(url: string, dump: Buffer): Promise<void> {
    pgTool('pg_restore', url, ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '--dbname', decodeURIComponent(new URL(url).pathname.slice(1))], dump);
  }

  beforeAll(async () => {
    testUrl = assertLocalMigrationDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
    admin = new Client({ connectionString: testUrl });
    await admin.connect();
    mkdirSync(join(root, '.worktrees'), { recursive: true });
    directory = mkdtempSync(join(root, '.worktrees/migration-rehearsal-'));
    const legacyDirectory = join(directory, 'migrations');
    mkdirSync(legacyDirectory);
    cpSync(join(root, 'prisma/migrations/migration_lock.toml'), join(legacyDirectory, 'migration_lock.toml'));
    for (const name of legacyMigrations) cpSync(join(root, 'prisma/migrations', name), join(legacyDirectory, name), { recursive: true });
    legacyConfig = join(directory, 'prisma.config.ts');
    writeFileSync(legacyConfig, `export default { schema: ${JSON.stringify(join(root, 'prisma/schema.prisma'))}, migrations: { path: ${JSON.stringify(legacyDirectory)} }, datasource: { url: process.env.DATABASE_URL } };\n`);
    const created = await createDatabase();
    source = created.client;
    sourceUrl = created.url;
    deploy(sourceUrl, legacyConfig);
    await source.query(readFileSync(join(root, 'test/fixtures/legacy-migration.sql'), 'utf8'));
    beforeColumns = await columns(source);
    before = await snapshot(source, beforeColumns);
    legacyDump = pgTool('pg_dump', sourceUrl, ['--format=custom', '--no-owner', '--no-acl']);
    writeFileSync(join(directory, 'before.dump'), legacyDump);
    const contents = pgTool('pg_restore', sourceUrl, ['--list'], legacyDump).toString('utf8');
    writeFileSync(join(directory, 'before.contents.txt'), contents);
    for (const table of allTables) expect(contents).toContain(`TABLE DATA public ${table}`);
  }, 180_000);

  afterAll(async () => {
    if (directory) writeFileSync(join(directory, 'databases.json'), JSON.stringify({ databases, note: 'Synthetic fixtures and dumps preserved. No database was dropped or overwritten.' }, null, 2));
    await Promise.all(clients.map((client) => client.end()));
    await admin?.end();
  });

  it('preserves every source row and legacy field while deterministically expanding lifecycle/readiness/refresh families', async () => {
    expect(Object.fromEntries(Object.entries(before).map(([table, rows]) => [table, rows.length])))
      .toEqual({ User: 2, Exercise: 3, Routine: 2, RoutineExercise: 3, Workout: 6, WorkoutSet: 9, CycleEntry: 2, Readiness: 5, RefreshToken: 2, ExerciseStat: 2 });
    deploy(sourceUrl);
    const sourceColumns = Object.fromEntries(tables.map((table) => [table, beforeColumns[table]]));
    expect(await snapshot(source, sourceColumns)).toEqual(Object.fromEntries(tables.map((table) => [table, before[table]])));

    const statuses = await source.query('SELECT "id", "status", ("cancelledAt" IS NOT NULL) AS cancelled, "clientId", "revision" FROM "Workout" ORDER BY "id"');
    expect(statuses.rows).toEqual([
      { id: 'migration-completed-1', status: 'COMPLETED', cancelled: false, clientId: null, revision: 1 },
      { id: 'migration-completed-2', status: 'COMPLETED', cancelled: false, clientId: null, revision: 1 },
      { id: 'migration-old-active', status: 'CANCELLED', cancelled: true, clientId: null, revision: 1 },
      { id: 'migration-other-active', status: 'ACTIVE', cancelled: false, clientId: null, revision: 1 },
      { id: 'migration-tied-active-a', status: 'CANCELLED', cancelled: true, clientId: null, revision: 1 },
      { id: 'migration-tied-active-z', status: 'ACTIVE', cancelled: false, clientId: null, revision: 1 },
    ]);
    const readiness = await source.query('SELECT "id", "civilDate"::text AS day FROM "Readiness" ORDER BY "id"');
    expect(readiness.rows).toEqual([
      { id: 'migration-ready-before-midnight', day: '2026-08-01' },
      { id: 'migration-ready-old', day: null },
      { id: 'migration-ready-other', day: '2026-08-02' },
      { id: 'migration-ready-tie-a', day: null },
      { id: 'migration-ready-tie-z', day: '2026-08-02' },
    ]);
    const tokens = await source.query('SELECT "familyId", "platform" FROM "RefreshToken"');
    expect(tokens.rows).toHaveLength(2);
    expect(new Set(tokens.rows.map((row) => row.familyId)).size).toBe(2);
    for (const token of tokens.rows) {
      expect(token.familyId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
      expect(token.platform).toBe('WEB');
    }
    expect((await source.query('SELECT COUNT(*)::integer AS count FROM "WorkoutSet" WHERE "clientId" IS NULL AND revision = 1')).rows[0].count).toBe(9);
    expect((await source.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name')).rows.map((row) => row.migration_name)).toEqual(migrations);
  }, 180_000);

  it('rebuilds exact records from useful completed working sets, excluding warmups, drafts and invalid sets', async () => {
    const result = await source.query('SELECT to_jsonb(stat) AS row FROM "ExerciseStat" stat ORDER BY "exerciseId"');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].row).toEqual({ userId: 'migration-user-a', exerciseId: 'migration-hold', estimated1RM: 0, bestWeight: 0, bestReps: 0, lastSetAt: '2026-08-02T12:40:00', trendSlope: 0, sessionsCount: 1, bestWeightAt: null, bestRepsWeightKg: null, bestRepsAt: null, estimated1RMAt: null, estimated1RMWeightKg: null, estimated1RMReps: null });
    expect(result.rows[1].row).toEqual({ userId: 'migration-user-a', exerciseId: 'migration-lift', estimated1RM: expect.closeTo(98, 8), bestWeight: 80, bestReps: 12, lastSetAt: '2026-08-02T12:20:00', trendSlope: 0, sessionsCount: 2, bestWeightAt: '2026-08-02T12:20:00', bestRepsWeightKg: 70, bestRepsAt: '2026-08-02T12:10:00', estimated1RMAt: '2026-08-02T12:10:00', estimated1RMWeightKg: 70, estimated1RMReps: 12 });
  });

  it('enforces active-session and routine/set/readiness uniqueness after preserving legacy rows', async () => {
    const attempts = [
      `INSERT INTO "Workout" (id, "userId", name) VALUES ('rejected-active', 'migration-user-a', 'Duplicate')`,
      `INSERT INTO "RoutineExercise" (id, "routineId", "exerciseId", "order") VALUES ('rejected-exercise', 'migration-routine-a', 'migration-lift', 9)`,
      `INSERT INTO "RoutineExercise" (id, "routineId", "exerciseId", "order") VALUES ('rejected-order', 'migration-routine-a', 'migration-empty', 0)`,
      `INSERT INTO "WorkoutSet" (id, "workoutId", "exerciseId", "order", "updatedAt") VALUES ('rejected-set', 'migration-completed-1', 'migration-lift', 0, NOW())`,
      `INSERT INTO "Readiness" (id, "userId", "civilDate", score) VALUES ('rejected-readiness', 'migration-user-a', '2026-08-02', 10)`,
    ];
    const unchanged = await snapshot(source, await columns(source));
    for (const sql of attempts) await expect(source.query(sql)).rejects.toMatchObject({ code: '23505' });
    expect(await snapshot(source, await columns(source))).toEqual(unchanged);
  });

  it('restores the pre-migration archive into a fresh database, retains every field, then successfully migrates that copy', async () => {
    const recovered = await createDatabase();
    await restore(recovered.url, legacyDump);
    expect(await snapshot(recovered.client, beforeColumns)).toEqual(before);
    deploy(recovered.url);
    const stableColumns = await columns(source);
    // Only migration-time timestamps differ between independent rehearsals.
    stableColumns.Workout = stableColumns.Workout.filter((field) => !['cancelledAt', 'updatedAt'].includes(field));
    stableColumns.WorkoutSet = stableColumns.WorkoutSet.filter((field) => field !== 'updatedAt');
    expect(await snapshot(recovered.client, stableColumns)).toEqual(await snapshot(source, stableColumns));
  }, 180_000);

  it('restores the post-migration archive exactly and repeating deploy changes neither source nor derived rows', async () => {
    const canonical = await snapshot(source, await columns(source));
    const dump = pgTool('pg_dump', sourceUrl, ['--format=custom', '--no-owner', '--no-acl']);
    writeFileSync(join(directory, 'after.dump'), dump);
    const recovered = await createDatabase();
    await restore(recovered.url, dump);
    expect(await snapshot(recovered.client, await columns(source))).toEqual(canonical);
    deploy(recovered.url);
    expect(await snapshot(recovered.client, await columns(source))).toEqual(canonical);
    // Run AppModule/Supertest/PostgreSQL acceptance against the restored populated copy,
    // not merely the normal empty integration database.
    const httpOutput = spawnSync(process.execPath, [join(root, 'node_modules/jest/bin/jest.js'), '--config', 'test/jest-integration.json', '--runInBand'], {
      cwd: root,
      env: { ...process.env, TEST_DATABASE_URL: recovered.url },
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    writeFileSync(join(directory, 'after-restore.integration.log'), `${httpOutput.stdout ?? ''}${httpOutput.stderr ?? ''}`);
    if (httpOutput.error) throw httpOutput.error;
    expect(httpOutput.status).toBe(0);
    expect(await snapshot(recovered.client, await columns(source))).toEqual(canonical);
    deploy(sourceUrl);
    expect(await snapshot(source, await columns(source))).toEqual(canonical);
  }, 180_000);

  it.each([
    ['routine exercise', `INSERT INTO "RoutineExercise" (id, "routineId", "exerciseId", "order") VALUES ('legacy-duplicate', 'migration-routine-a', 'migration-lift', 9)`],
    ['routine order', `INSERT INTO "RoutineExercise" (id, "routineId", "exerciseId", "order") VALUES ('legacy-duplicate', 'migration-routine-a', 'migration-empty', 0)`],
    ['set order', `INSERT INTO "WorkoutSet" (id, "workoutId", "exerciseId", "order") VALUES ('legacy-duplicate', 'migration-completed-1', 'migration-lift', 0)`],
  ])('aborts offline expansion atomically for a legacy duplicate %s, keeping source rows for reviewed cleanup', async (_kind, sql) => {
    const failed = await createDatabase();
    await restore(failed.url, legacyDump);
    await failed.client.query(sql);
    const sourceColumns = Object.fromEntries(tables.map((table) => [table, beforeColumns[table]]));
    const original = await snapshot(failed.client, sourceColumns);
    let failure: { stderr?: Buffer | string } | undefined;
    try {
      deploy(failed.url);
    } catch (error) {
      failure = error as { stderr?: Buffer | string };
    }
    expect(failure?.stderr?.toString()).toContain('ERROR');
    expect(await snapshot(failed.client, sourceColumns)).toEqual(original);
    const added = await failed.client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Workout' AND column_name IN ('status', 'clientId', 'revision')`);
    expect(added.rows).toEqual([]);
    const history = await failed.client.query(`SELECT finished_at FROM "_prisma_migrations" WHERE migration_name = '20260829010000_offline_sync_expand'`);
    expect(history.rows).toHaveLength(1);
    expect(history.rows[0].finished_at).toBeNull();
    // Prisma may mask a BEGIN-block exception with "current transaction is aborted".
    // Exercise the same shipped SQL separately to prove the duplicate is the cause.
    await expect(failed.client.query(readFileSync(join(root, 'prisma/migrations/20260829010000_offline_sync_expand/migration.sql'), 'utf8')))
      .rejects.toThrow('duplicates require reviewed cleanup');
    await failed.client.query('ROLLBACK');
    expect(await snapshot(failed.client, sourceColumns)).toEqual(original);
  }, 180_000);
});
