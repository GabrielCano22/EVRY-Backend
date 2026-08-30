-- Expand, deterministically backfill, and verify derived exercise records in one transaction.
-- Nullable columns keep old readers compatible. Old and new writers must not run together.
BEGIN;

ALTER TABLE "ExerciseStat" ADD COLUMN IF NOT EXISTS "bestWeightAt" TIMESTAMP(3);
ALTER TABLE "ExerciseStat" ADD COLUMN IF NOT EXISTS "bestRepsWeightKg" DOUBLE PRECISION;
ALTER TABLE "ExerciseStat" ADD COLUMN IF NOT EXISTS "bestRepsAt" TIMESTAMP(3);
ALTER TABLE "ExerciseStat" ADD COLUMN IF NOT EXISTS "estimated1RMAt" TIMESTAMP(3);
ALTER TABLE "ExerciseStat" ADD COLUMN IF NOT EXISTS "estimated1RMWeightKg" DOUBLE PRECISION;
ALTER TABLE "ExerciseStat" ADD COLUMN IF NOT EXISTS "estimated1RMReps" INTEGER;

-- Aggregate-only report before replacing derived rows.
DO $$
DECLARE
  prior_stat_count BIGINT;
  eligible_set_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO prior_stat_count FROM "ExerciseStat";
  SELECT COUNT(*) INTO eligible_set_count
  FROM "WorkoutSet" AS workout_set
  INNER JOIN "Workout" AS workout ON workout."id" = workout_set."workoutId"
  WHERE workout."endedAt" IS NOT NULL
    AND workout."cancelledAt" IS NULL
    AND workout_set."isWarmup" = FALSE
    AND (workout_set."reps" > 0 OR workout_set."durationS" > 0);

  RAISE NOTICE 'Rebuilding % prior exercise stats from % eligible sets',
    prior_stat_count, eligible_set_count;
END $$;

CREATE TEMP TABLE "Task2ExerciseStatBackfill" (
  "userId" TEXT NOT NULL,
  "exerciseId" TEXT NOT NULL,
  "estimated1RM" DOUBLE PRECISION NOT NULL,
  "bestWeight" DOUBLE PRECISION NOT NULL,
  "bestReps" INTEGER NOT NULL,
  "lastSetAt" TIMESTAMP(3) NOT NULL,
  "trendSlope" DOUBLE PRECISION NOT NULL,
  "sessionsCount" INTEGER NOT NULL,
  "bestWeightAt" TIMESTAMP(3),
  "bestRepsWeightKg" DOUBLE PRECISION,
  "bestRepsAt" TIMESTAMP(3),
  "estimated1RMAt" TIMESTAMP(3),
  "estimated1RMWeightKg" DOUBLE PRECISION,
  "estimated1RMReps" INTEGER,
  PRIMARY KEY ("userId", "exerciseId")
) ON COMMIT DROP;

WITH eligible_sets AS (
  SELECT
    workout."userId" AS "userId",
    workout_set."exerciseId" AS "exerciseId",
    workout_set."workoutId" AS "workoutId",
    workout_set."id" AS "setId",
    workout_set."weightKg" AS "weightKg",
    workout_set."reps" AS "reps",
    workout_set."durationS" AS "durationS",
    workout_set."completedAt" AS "completedAt"
  FROM "WorkoutSet" AS workout_set
  INNER JOIN "Workout" AS workout ON workout."id" = workout_set."workoutId"
  WHERE workout."endedAt" IS NOT NULL
    AND workout."cancelledAt" IS NULL
    AND workout_set."isWarmup" = FALSE
    AND (workout_set."reps" > 0 OR workout_set."durationS" > 0)
),
aggregates AS (
  SELECT
    "userId",
    "exerciseId",
    COUNT(DISTINCT "workoutId")::INTEGER AS "sessionsCount",
    MAX("completedAt") AS "lastSetAt"
  FROM eligible_sets
  GROUP BY "userId", "exerciseId"
),
ranked_weight AS (
  SELECT
    "userId",
    "exerciseId",
    "weightKg",
    "completedAt",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "exerciseId"
      ORDER BY "weightKg" DESC, "completedAt" DESC, "setId" DESC
    ) AS record_rank
  FROM eligible_sets
  WHERE "weightKg" > 0
),
ranked_reps AS (
  SELECT
    "userId",
    "exerciseId",
    "reps",
    "weightKg",
    "completedAt",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "exerciseId"
      ORDER BY "reps" DESC, "completedAt" DESC, "setId" DESC
    ) AS record_rank
  FROM eligible_sets
  WHERE "reps" > 0
),
epley_values AS (
  SELECT
    "userId",
    "exerciseId",
    "setId",
    "weightKg",
    "reps",
    "completedAt",
    "weightKg" * (1 + "reps" / 30.0) AS "estimated1RM"
  FROM eligible_sets
  WHERE "weightKg" > 0 AND "reps" > 0
),
ranked_epley AS (
  SELECT
    "userId",
    "exerciseId",
    "weightKg",
    "reps",
    "completedAt",
    "estimated1RM",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "exerciseId"
      ORDER BY "estimated1RM" DESC, "completedAt" DESC, "setId" DESC
    ) AS record_rank
  FROM epley_values
)
INSERT INTO "Task2ExerciseStatBackfill" (
  "userId",
  "exerciseId",
  "estimated1RM",
  "bestWeight",
  "bestReps",
  "lastSetAt",
  "trendSlope",
  "sessionsCount",
  "bestWeightAt",
  "bestRepsWeightKg",
  "bestRepsAt",
  "estimated1RMAt",
  "estimated1RMWeightKg",
  "estimated1RMReps"
)
SELECT
  aggregates."userId",
  aggregates."exerciseId",
  COALESCE(ranked_epley."estimated1RM", 0),
  COALESCE(ranked_weight."weightKg", 0),
  COALESCE(ranked_reps."reps", 0),
  aggregates."lastSetAt",
  0,
  aggregates."sessionsCount",
  ranked_weight."completedAt",
  ranked_reps."weightKg",
  ranked_reps."completedAt",
  ranked_epley."completedAt",
  ranked_epley."weightKg",
  ranked_epley."reps"
FROM aggregates
LEFT JOIN ranked_weight
  ON ranked_weight."userId" = aggregates."userId"
  AND ranked_weight."exerciseId" = aggregates."exerciseId"
  AND ranked_weight.record_rank = 1
LEFT JOIN ranked_reps
  ON ranked_reps."userId" = aggregates."userId"
  AND ranked_reps."exerciseId" = aggregates."exerciseId"
  AND ranked_reps.record_rank = 1
LEFT JOIN ranked_epley
  ON ranked_epley."userId" = aggregates."userId"
  AND ranked_epley."exerciseId" = aggregates."exerciseId"
  AND ranked_epley.record_rank = 1;

DELETE FROM "ExerciseStat";

INSERT INTO "ExerciseStat" (
  "userId",
  "exerciseId",
  "estimated1RM",
  "bestWeight",
  "bestReps",
  "lastSetAt",
  "trendSlope",
  "sessionsCount",
  "bestWeightAt",
  "bestRepsWeightKg",
  "bestRepsAt",
  "estimated1RMAt",
  "estimated1RMWeightKg",
  "estimated1RMReps"
)
SELECT
  "userId",
  "exerciseId",
  "estimated1RM",
  "bestWeight",
  "bestReps",
  "lastSetAt",
  "trendSlope",
  "sessionsCount",
  "bestWeightAt",
  "bestRepsWeightKg",
  "bestRepsAt",
  "estimated1RMAt",
  "estimated1RMWeightKg",
  "estimated1RMReps"
FROM "Task2ExerciseStatBackfill";

DO $$
BEGIN
  IF EXISTS (
    SELECT "userId", "exerciseId"
    FROM "Task2ExerciseStatBackfill"
    GROUP BY "userId", "exerciseId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate derived rows';
  END IF;

  IF EXISTS (
    SELECT
      "userId", "exerciseId", "estimated1RM", "bestWeight", "bestReps",
      "lastSetAt", "trendSlope", "sessionsCount", "bestWeightAt",
      "bestRepsWeightKg", "bestRepsAt", "estimated1RMAt",
      "estimated1RMWeightKg", "estimated1RMReps"
    FROM "Task2ExerciseStatBackfill"
    EXCEPT
    SELECT
      "userId", "exerciseId", "estimated1RM", "bestWeight", "bestReps",
      "lastSetAt", "trendSlope", "sessionsCount", "bestWeightAt",
      "bestRepsWeightKg", "bestRepsAt", "estimated1RMAt",
      "estimated1RMWeightKg", "estimated1RMReps"
    FROM "ExerciseStat"
  ) THEN
    RAISE EXCEPTION 'expected stats missing or different from actual';
  END IF;

  IF EXISTS (
    SELECT
      "userId", "exerciseId", "estimated1RM", "bestWeight", "bestReps",
      "lastSetAt", "trendSlope", "sessionsCount", "bestWeightAt",
      "bestRepsWeightKg", "bestRepsAt", "estimated1RMAt",
      "estimated1RMWeightKg", "estimated1RMReps"
    FROM "ExerciseStat"
    EXCEPT
    SELECT
      "userId", "exerciseId", "estimated1RM", "bestWeight", "bestReps",
      "lastSetAt", "trendSlope", "sessionsCount", "bestWeightAt",
      "bestRepsWeightKg", "bestRepsAt", "estimated1RMAt",
      "estimated1RMWeightKg", "estimated1RMReps"
    FROM "Task2ExerciseStatBackfill"
  ) THEN
    RAISE EXCEPTION 'actual stats missing or different from expected';
  END IF;
END $$;

COMMIT;

-- ROLLBACK NOTE: only manually, after a backup and a data-impact review.
-- Review writer compatibility and derived data before any contraction.
-- ALTER TABLE "ExerciseStat" DROP COLUMN IF EXISTS "bestWeightAt";
-- ALTER TABLE "ExerciseStat" DROP COLUMN IF EXISTS "bestRepsWeightKg";
-- ALTER TABLE "ExerciseStat" DROP COLUMN IF EXISTS "bestRepsAt";
-- ALTER TABLE "ExerciseStat" DROP COLUMN IF EXISTS "estimated1RMAt";
-- ALTER TABLE "ExerciseStat" DROP COLUMN IF EXISTS "estimated1RMWeightKg";
-- ALTER TABLE "ExerciseStat" DROP COLUMN IF EXISTS "estimated1RMReps";
