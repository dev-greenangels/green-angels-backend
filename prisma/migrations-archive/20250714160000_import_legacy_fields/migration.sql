-- AlterTable
ALTER TABLE "Characteristic" ADD COLUMN IF NOT EXISTS "legacyId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Characteristic_legacyId_key" ON "Characteristic"("legacyId");

-- AlterTable
ALTER TABLE "CharacteristicOption" ADD COLUMN IF NOT EXISTS "legacyId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CharacteristicOption_legacyId_key" ON "CharacteristicOption"("legacyId");

-- AlterTable
CREATE UNIQUE INDEX IF NOT EXISTS "VariantAttribute_legacyId_key" ON "VariantAttribute"("legacyId");

-- AlterTable
CREATE UNIQUE INDEX IF NOT EXISTS "VariantAttributeValue_legacyId_key" ON "VariantAttributeValue"("legacyId");

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "lengthCm" DOUBLE PRECISION;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "widthCm" DOUBLE PRECISION;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "heightCm" DOUBLE PRECISION;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "volumetricWeightKg" DOUBLE PRECISION;
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_legacyId_key" ON "ProductVariant"("legacyId");

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN IF NOT EXISTS "legacyId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ProductImage_legacyId_key" ON "ProductImage"("legacyId");

-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "legacyId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_legacyId_key" ON "BlogPost"("legacyId");
