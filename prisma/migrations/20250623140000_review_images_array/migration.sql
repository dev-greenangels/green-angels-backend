-- AlterTable
ALTER TABLE "Review" ADD COLUMN "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill from legacy single image
UPDATE "Review" SET "images" = ARRAY["image"] WHERE "image" IS NOT NULL AND cardinality("images") = 0;
