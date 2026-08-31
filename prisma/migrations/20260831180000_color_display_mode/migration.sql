-- CreateEnum
CREATE TYPE "ColorDisplayMode" AS ENUM ('TEXT', 'SWATCH', 'BOTH');

-- AlterTable
ALTER TABLE "Characteristic" ADD COLUMN "colorDisplayMode" "ColorDisplayMode";

-- AlterTable
ALTER TABLE "VariantAttribute" ADD COLUMN "colorDisplayMode" "ColorDisplayMode";

-- Default existing COLOR rows to BOTH
UPDATE "Characteristic"
SET "colorDisplayMode" = 'BOTH'
WHERE "valueType" = 'COLOR';

UPDATE "VariantAttribute"
SET "colorDisplayMode" = 'BOTH'
WHERE "valueType" = 'COLOR';
