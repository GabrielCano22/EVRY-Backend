-- Expand-only migration. Existing legacy rows keep nullable new fields.
BEGIN;

ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "WorkoutSet" ADD COLUMN IF NOT EXISTS "clientMutationId" TEXT;
ALTER TABLE "WorkoutSet" ADD COLUMN IF NOT EXISTS "techniqueStable" BOOLEAN;

-- Observable pre-normalization report with aggregate counts only.
DO $$
DECLARE
  duplicate_group_count INTEGER;
  rows_to_cancel INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER, COALESCE(SUM(active_count - 1), 0)::INTEGER
  INTO duplicate_group_count, rows_to_cancel
  FROM (
    SELECT COUNT(*) AS active_count
    FROM "Workout"
    WHERE "endedAt" IS NULL AND "cancelledAt" IS NULL
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  ) AS duplicate_groups;

  RAISE NOTICE 'Normalizing % duplicate active-workout groups; % rows will be cancelled',
    duplicate_group_count, rows_to_cancel;
END $$;

-- Deterministically retain the latest active workout. No Workout or WorkoutSet is deleted.
WITH ranked_active_workouts AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "startedAt" DESC, "id" DESC) AS rank
  FROM "Workout"
  WHERE "endedAt" IS NULL AND "cancelledAt" IS NULL
)
UPDATE "Workout" AS workout
SET "cancelledAt" = CURRENT_TIMESTAMP
FROM ranked_active_workouts
WHERE workout."id" = ranked_active_workouts."id"
  AND ranked_active_workouts.rank > 1;

-- Abort atomically if normalization did not leave exactly one active workout per user.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Workout"
    WHERE "endedAt" IS NULL AND "cancelledAt" IS NULL
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Active workout duplicate verification failed';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Workout_userId_active_unique"
  ON "Workout" ("userId")
  WHERE "endedAt" IS NULL AND "cancelledAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Workout_userId_endedAt_id_idx"
  ON "Workout" ("userId", "endedAt" DESC, "id");
CREATE UNIQUE INDEX IF NOT EXISTS "WorkoutSet_workoutId_clientMutationId_key"
  ON "WorkoutSet" ("workoutId", "clientMutationId");
CREATE INDEX IF NOT EXISTS "WorkoutSet_exerciseId_workoutId_completedAt_idx"
  ON "WorkoutSet" ("exerciseId", "workoutId", "completedAt" DESC);

COMMIT;

-- ROLLBACK NOTE: only manually, after a backup and a data-impact review. Dropping
-- these columns loses values collected after this migration; never run rollback automatically.
-- Manual rollback order:
-- DROP INDEX IF EXISTS "Workout_userId_active_unique";
-- DROP INDEX IF EXISTS "Workout_userId_endedAt_id_idx";
-- DROP INDEX IF EXISTS "WorkoutSet_workoutId_clientMutationId_key";
-- DROP INDEX IF EXISTS "WorkoutSet_exerciseId_workoutId_completedAt_idx";
-- ALTER TABLE "Workout" DROP COLUMN IF EXISTS "cancelledAt";
-- ALTER TABLE "WorkoutSet" DROP COLUMN IF EXISTS "clientMutationId";
-- ALTER TABLE "WorkoutSet" DROP COLUMN IF EXISTS "techniqueStable";
