import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
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
    expect(migration.match(/COMMIT;/g)).toHaveLength(1);
    const postCommit = migration.slice(migration.indexOf('COMMIT;') + 'COMMIT;'.length);
    const executablePostCommitLines = postCommit
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('--'));
    expect(executablePostCommitLines).toEqual([]);
    const rollbackSteps = [
      '-- DROP INDEX IF EXISTS "Workout_userId_active_unique";',
      '-- DROP INDEX IF EXISTS "Workout_userId_endedAt_id_idx";',
      '-- DROP INDEX IF EXISTS "WorkoutSet_workoutId_clientMutationId_key";',
      '-- DROP INDEX IF EXISTS "WorkoutSet_exerciseId_workoutId_completedAt_idx";',
      '-- ALTER TABLE "Workout" DROP COLUMN IF EXISTS "cancelledAt";',
      '-- ALTER TABLE "WorkoutSet" DROP COLUMN IF EXISTS "clientMutationId";',
      '-- ALTER TABLE "WorkoutSet" DROP COLUMN IF EXISTS "techniqueStable";',
    ];
    const rollbackStart = migration.indexOf('ROLLBACK NOTE');
    expect(rollbackStart).toBeGreaterThan(migration.indexOf('COMMIT;'));
    expect(migration.slice(rollbackStart)).toContain('only manually, after a backup and a data-impact review');
    rollbackSteps.forEach((step, index) => {
      expect(migration).toContain(step);
      if (index > 0) {
        expect(migration.indexOf(step)).toBeGreaterThan(migration.indexOf(rollbackSteps[index - 1]));
      }
    });
  });
});
