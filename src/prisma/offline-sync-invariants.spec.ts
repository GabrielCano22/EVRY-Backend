import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(root, 'prisma', 'migrations', '20260829010000_offline_sync_expand', 'migration.sql'),
  'utf8',
);

describe('offline synchronization invariants', () => {
  it('models explicit lifecycle, client identity and optimistic revisions', () => {
    expect(schema).toContain('enum WorkoutStatus');
    expect(schema).toMatch(/status\s+WorkoutStatus\s+@default\(ACTIVE\)/);
    expect(schema).toMatch(/clientId\s+String\?\s+@db\.Uuid/);
    expect(schema.match(/revision\s+Int\s+@default\(1\)/g)).toHaveLength(2);
    expect(schema).toContain('@@unique([userId, clientId])');
    expect(schema).toContain('@@unique([userId, lastSyncId])');
    expect(schema).toContain('@@unique([workoutId, clientId])');
  });

  it('enforces routine, set and daily readiness uniqueness in the data model', () => {
    expect(schema).toContain('@@unique([routineId, exerciseId])');
    expect(schema).toContain('@@unique([routineId, order])');
    expect(schema).toContain('@@unique([workoutId, exerciseId, order])');
    expect(schema).toContain('@@unique([userId, civilDate])');
    expect(schema).toMatch(/model Readiness[\s\S]*civilDate\s+DateTime\?\s+@db\.Date/);
  });

  it('backfills lifecycle without deleting user data and creates the active partial index', () => {
    expect(migration).toContain('CREATE TYPE "WorkoutStatus"');
    expect(migration).toContain('WHEN "endedAt" IS NOT NULL THEN \'COMPLETED\'');
    expect(migration).toContain('WHEN "cancelledAt" IS NOT NULL THEN \'CANCELLED\'');
    expect(migration).toContain('CREATE UNIQUE INDEX "Workout_userId_status_active_unique"');
    expect(migration).toContain('WHERE "status" = \'ACTIVE\'');
    expect(migration).toContain('ROW_NUMBER() OVER');
    expect(migration).toContain('"civilDate"');
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"(?:Workout|WorkoutSet|Routine|Readiness)"/i);
  });
});
