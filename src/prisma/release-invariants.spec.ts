import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8');
const migrationPath = join(root, 'prisma', 'migrations', '20260819090000_release_invariants', 'migration.sql');
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('release invariants schema and migration', () => {
  it('mantiene la expansión nullable y los índices Prisma exactos', () => {
    expect(schema).toMatch(/cancelledAt\s+DateTime\?/);
    expect(schema).toMatch(/clientMutationId\s+String\?/);
    expect(schema).toMatch(/techniqueStable\s+Boolean\?/);
    expect(schema).toContain('@@unique([workoutId, clientMutationId])');
    expect(schema).toContain('@@index([userId, endedAt(sort: Desc), id])');
    expect(schema).toContain('@@index([exerciseId, workoutId, completedAt(sort: Desc)])');
  });

  it('normaliza duplicados sin borrar datos antes de imponer el índice parcial', () => {
    expect(migration).toContain('BEGIN;');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "cancelledAt"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "clientMutationId"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "techniqueStable"');
    expect(migration).toMatch(/ROW_NUMBER\(\) OVER \(PARTITION BY "userId" ORDER BY "startedAt" DESC, "id" DESC\)/);
    expect(migration).toContain('SET "cancelledAt" = CURRENT_TIMESTAMP');
    expect(migration).toContain('duplicate_group_count');
    expect(migration).toContain('rows_to_cancel');
    expect(migration).not.toContain('duplicate_group."userId"');
    expect(migration).toContain('WHERE "endedAt" IS NULL AND "cancelledAt" IS NULL');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "Workout_userId_active_unique"');
    expect(migration).not.toContain('DELETE FROM "Workout"');
    expect(migration).not.toContain('DELETE FROM "WorkoutSet"');
    expect(migration).toContain('ROLLBACK NOTE');
    expect(migration).toContain('COMMIT;');
  });
});
