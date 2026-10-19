-- Forward-only repair of derived Epley fields; applied migration checksums stay intact.
-- Back up first and pause workout writers during rollout. Readers remain compatible.
-- Source rows and all unrelated ExerciseStat fields are preserved.
BEGIN;

-- Hold a stable source snapshot against concurrent finalization/rebuild writes.
LOCK TABLE "Workout", "WorkoutSet" IN SHARE MODE;
LOCK TABLE "ExerciseStat" IN SHARE ROW EXCLUSIVE MODE;

WITH ranked_records AS (
  SELECT
    workout."userId",
    workout_set."exerciseId",
    workout_set."weightKg",
    workout_set."reps",
    workout_set."completedAt",
    workout_set."weightKg" * (1 + workout_set."reps" / 30.0::double precision) AS value,
    ROW_NUMBER() OVER (
      PARTITION BY workout."userId", workout_set."exerciseId"
      ORDER BY
        workout_set."weightKg" * (1 + workout_set."reps" / 30.0::double precision) DESC,
        workout_set."completedAt" DESC,
        workout_set."id" COLLATE "C" DESC
    ) AS record_rank
  FROM "WorkoutSet" AS workout_set
  INNER JOIN "Workout" AS workout ON workout.id = workout_set."workoutId"
  WHERE workout."endedAt" IS NOT NULL
    AND workout."cancelledAt" IS NULL
    AND workout_set."isWarmup" = FALSE
    AND workout_set."weightKg" > 0
    AND workout_set."reps" > 0
), canonical AS (
  SELECT
    stat."userId", stat."exerciseId",
    COALESCE(record.value, 0) AS value,
    record."completedAt", record."weightKg", record."reps"
  FROM "ExerciseStat" AS stat
  LEFT JOIN ranked_records AS record
    ON record."userId" = stat."userId"
    AND record."exerciseId" = stat."exerciseId"
    AND record.record_rank = 1
)
UPDATE "ExerciseStat" AS stat
SET "estimated1RM" = canonical.value,
    "estimated1RMAt" = canonical."completedAt",
    "estimated1RMWeightKg" = canonical."weightKg",
    "estimated1RMReps" = canonical."reps"
FROM canonical
WHERE stat."userId" = canonical."userId"
  AND stat."exerciseId" = canonical."exerciseId"
  AND ROW(stat."estimated1RM", stat."estimated1RMAt", stat."estimated1RMWeightKg", stat."estimated1RMReps")
    IS DISTINCT FROM ROW(canonical.value, canonical."completedAt", canonical."weightKg", canonical."reps");

COMMIT;

-- Recovery: restore the pre-repair archive into a NEW database and verify source
-- inventories before switching any reader/writer. Never reset the original database.
