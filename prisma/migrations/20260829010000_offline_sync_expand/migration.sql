-- Expand/contract foundation for explicit workout lifecycle and offline identity.
-- Existing user data is retained. Legacy duplicate readiness rows remain with
-- civilDate = NULL; the newest row for each Bogotá civil day becomes canonical.
BEGIN;

DO $$
BEGIN
  CREATE TYPE "WorkoutStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "status" "WorkoutStatus";
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "clientId" UUID;
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "lastSyncId" UUID;
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Workout" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Workout"
SET "status" = CASE
  WHEN "endedAt" IS NOT NULL THEN 'COMPLETED'::"WorkoutStatus"
  WHEN "cancelledAt" IS NOT NULL THEN 'CANCELLED'::"WorkoutStatus"
  ELSE 'ACTIVE'::"WorkoutStatus"
END
WHERE "status" IS NULL;

ALTER TABLE "Workout" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
ALTER TABLE "Workout" ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE "WorkoutSet" ADD COLUMN IF NOT EXISTS "clientId" UUID;
ALTER TABLE "WorkoutSet" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "WorkoutSet" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Readiness" ADD COLUMN IF NOT EXISTS "civilDate" DATE;
WITH ranked_readiness AS (
  SELECT
    "id",
    (("date" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota')::DATE AS bogota_date,
    ROW_NUMBER() OVER (
      PARTITION BY "userId", (("date" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota')::DATE
      ORDER BY "date" DESC, "id" DESC
    ) AS rank
  FROM "Readiness"
)
UPDATE "Readiness" AS readiness
SET "civilDate" = ranked.bogota_date
FROM ranked_readiness AS ranked
WHERE readiness."id" = ranked."id"
  AND ranked.rank = 1
  AND readiness."civilDate" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "RoutineExercise"
    GROUP BY "routineId", "exerciseId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Routine exercise duplicates require reviewed cleanup before migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "RoutineExercise"
    GROUP BY "routineId", "order"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Routine order duplicates require reviewed cleanup before migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "WorkoutSet"
    GROUP BY "workoutId", "exerciseId", "order"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Workout set order duplicates require reviewed cleanup before migration';
  END IF;
END $$;

DROP INDEX IF EXISTS "Workout_userId_active_unique";
CREATE UNIQUE INDEX "Workout_userId_status_active_unique"
  ON "Workout" ("userId")
  WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "Workout_userId_clientId_key" ON "Workout" ("userId", "clientId");
CREATE UNIQUE INDEX "Workout_userId_lastSyncId_key" ON "Workout" ("userId", "lastSyncId");
CREATE INDEX "Workout_userId_status_startedAt_idx"
  ON "Workout" ("userId", "status", "startedAt" DESC);
CREATE UNIQUE INDEX "RoutineExercise_routineId_exerciseId_key"
  ON "RoutineExercise" ("routineId", "exerciseId");
CREATE UNIQUE INDEX "RoutineExercise_routineId_order_key"
  ON "RoutineExercise" ("routineId", "order");
CREATE UNIQUE INDEX "WorkoutSet_workoutId_clientId_key"
  ON "WorkoutSet" ("workoutId", "clientId");
CREATE UNIQUE INDEX "WorkoutSet_workoutId_exerciseId_order_key"
  ON "WorkoutSet" ("workoutId", "exerciseId", "order");
CREATE UNIQUE INDEX "Readiness_userId_civilDate_key"
  ON "Readiness" ("userId", "civilDate");

COMMIT;

-- Contract follow-up: after staging validation confirms every active mobile row
-- has a clientId, a later migration may make clientId/civilDate non-null. This
-- migration intentionally keeps legacy rows nullable and performs no DELETE.
