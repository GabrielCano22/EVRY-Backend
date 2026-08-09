-- Enrich source and legacy exercises without changing existing references.
ALTER TABLE "Exercise" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "category" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "bodyPart" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "target" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "secondaryMuscles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Exercise" ADD COLUMN "equipmentLabel" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "instructions" JSONB;
ALTER TABLE "Exercise" ADD COLUMN "instructionSteps" JSONB;
ALTER TABLE "Exercise" ADD COLUMN "mediaId" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "imagePath" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "gifPath" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "attribution" TEXT;

CREATE UNIQUE INDEX "Exercise_sourceId_key" ON "Exercise"("sourceId");
CREATE INDEX "Exercise_category_idx" ON "Exercise"("category");
CREATE INDEX "Exercise_bodyPart_idx" ON "Exercise"("bodyPart");
CREATE INDEX "Exercise_equipmentLabel_idx" ON "Exercise"("equipmentLabel");
