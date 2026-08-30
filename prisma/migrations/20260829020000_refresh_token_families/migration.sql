-- Adds rotatable session families while retaining every existing refresh token.
BEGIN;

DO $$
BEGIN
  CREATE TYPE "RefreshTokenPlatform" AS ENUM ('WEB', 'MOBILE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "familyId" UUID;
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "platform" "RefreshTokenPlatform";

-- Derive a stable UUID from each legacy id without requiring pgcrypto.
UPDATE "RefreshToken"
SET "familyId" = (
  SUBSTRING(MD5("id") FROM 1 FOR 8) || '-' ||
  SUBSTRING(MD5("id") FROM 9 FOR 4) || '-' ||
  '4' || SUBSTRING(MD5("id") FROM 14 FOR 3) || '-' ||
  '8' || SUBSTRING(MD5("id") FROM 18 FOR 3) || '-' ||
  SUBSTRING(MD5("id") FROM 21 FOR 12)
)::UUID
WHERE "familyId" IS NULL;

UPDATE "RefreshToken" SET "platform" = 'WEB' WHERE "platform" IS NULL;

ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;
ALTER TABLE "RefreshToken" ALTER COLUMN "platform" SET DEFAULT 'WEB';
ALTER TABLE "RefreshToken" ALTER COLUMN "platform" SET NOT NULL;
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken" ("familyId");

COMMIT;
