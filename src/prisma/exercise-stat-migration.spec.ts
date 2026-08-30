import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8');
const migrationPath = join(
  root,
  'prisma',
  'migrations',
  '20260819130000_exercise_stat_records',
  'migration.sql',
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

describe('exercise stat records migration', () => {
  const columns = [
    ['bestWeightAt', 'DateTime?'],
    ['bestRepsWeightKg', 'Float?'],
    ['bestRepsAt', 'DateTime?'],
    ['estimated1RMAt', 'DateTime?'],
    ['estimated1RMWeightKg', 'Float?'],
    ['estimated1RMReps', 'Int?'],
  ] as const;

  it('expands ExerciseStat with six nullable Prisma fields', () => {
    for (const [name, type] of columns) {
      expect(schema).toMatch(new RegExp(`${name}\\s+${type.replace('?', '\\?')}`));
      expect(migration).toContain(`ADD COLUMN IF NOT EXISTS "${name}"`);
    }
  });

  it('backfills deterministically from finalized non-cancelled working sets only', () => {
    expect(migration).toContain('CREATE TEMP TABLE "Task2ExerciseStatBackfill"');
    expect(migration).toMatch(/workout\."endedAt" IS NOT NULL/i);
    expect(migration).toMatch(/workout\."cancelledAt" IS NULL/i);
    expect(migration).toMatch(/workout_set\."isWarmup" = FALSE/i);
    expect(migration).toMatch(/workout_set\."reps" > 0[\s\S]*workout_set\."durationS" > 0/i);
    expect(migration).toContain('COUNT(DISTINCT "workoutId")');
    expect(migration).toContain('ORDER BY "weightKg" DESC, "completedAt" DESC, "setId" DESC');
    expect(migration).toContain('ORDER BY "reps" DESC, "completedAt" DESC, "setId" DESC');
    expect(migration).toContain('"weightKg" * (1 + "reps" / 30.0)');
    expect(migration).toContain('ORDER BY "estimated1RM" DESC, "completedAt" DESC, "setId" DESC');
    expect(migration).toContain('DELETE FROM "ExerciseStat";');
    expect(migration).toContain('INSERT INTO "ExerciseStat"');
    expect(migration).toContain('trendSlope');
    expect(migration).toContain('duplicate derived rows');
    expect(migration).toContain('expected stats missing or different from actual');
    expect(migration).toContain('actual stats missing or different from expected');
    expect(migration).toMatch(/FROM "Task2ExerciseStatBackfill"[\s\S]+EXCEPT[\s\S]+FROM "ExerciseStat"/);
    expect(migration).toMatch(/FROM "ExerciseStat"[\s\S]+EXCEPT[\s\S]+FROM "Task2ExerciseStatBackfill"/);
  });

  it('uses one atomic commit, preserves workouts and leaves only commented rollback SQL after it', () => {
    expect(migration).toContain('BEGIN;');
    expect(migration.match(/\bCOMMIT;/g)).toHaveLength(1);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"Workout"/i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+"WorkoutSet"/i);

    const commitEnd = migration.indexOf('COMMIT;') + 'COMMIT;'.length;
    const postCommit = migration.slice(commitEnd);
    const executablePostCommitLines = postCommit
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('--'));
    expect(executablePostCommitLines).toEqual([]);

    const rollbackColumns = columns.map(([name]) =>
      `-- ALTER TABLE "ExerciseStat" DROP COLUMN IF EXISTS "${name}";`,
    );
    expect(postCommit).toContain('only manually, after a backup and a data-impact review');
    for (const [index, step] of rollbackColumns.entries()) {
      expect(postCommit).toContain(step);
      if (index > 0) {
        expect(postCommit.indexOf(step)).toBeGreaterThan(postCommit.indexOf(rollbackColumns[index - 1]));
      }
    }
    expect(postCommit.match(/-- ALTER TABLE "ExerciseStat" DROP COLUMN IF EXISTS/g)).toHaveLength(6);
  });
});
