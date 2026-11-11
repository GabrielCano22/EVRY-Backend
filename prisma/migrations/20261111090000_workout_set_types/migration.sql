-- Set types and explicit set completion.
-- `setType` becomes the source of truth; `isWarmup` stays as a derived column
-- because existing queries and clients still read it. A set is now created
-- unchecked (completedAt = NULL) and only gets a timestamp when the lifter
-- ticks it, so historical rows keep their original value.
BEGIN;

ALTER TABLE "WorkoutSet" ADD COLUMN IF NOT EXISTS "setType" TEXT NOT NULL DEFAULT 'NORMAL';

UPDATE "WorkoutSet"
SET "setType" = 'WARMUP'
WHERE "isWarmup" = TRUE AND "setType" = 'NORMAL';

ALTER TABLE "WorkoutSet" ALTER COLUMN "completedAt" DROP NOT NULL;
ALTER TABLE "WorkoutSet" ALTER COLUMN "completedAt" DROP DEFAULT;

COMMIT;
