-- Variant attribute typed values (UNIVERSAL, CONTAINER, RANGE, COLOR, NUMBER)

DO $$ BEGIN
  CREATE TYPE "VariantAttributeType" AS ENUM ('UNIVERSAL', 'CONTAINER', 'RANGE', 'COLOR', 'NUMBER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "VariantAttribute" ADD COLUMN IF NOT EXISTS "valueType" "VariantAttributeType" NOT NULL DEFAULT 'UNIVERSAL';
ALTER TABLE "VariantAttribute" ADD COLUMN IF NOT EXISTS "unit" TEXT;

ALTER TABLE "VariantAttributeTranslation" ADD COLUMN IF NOT EXISTS "description" TEXT;

ALTER TABLE "VariantAttributeValue" ADD COLUMN IF NOT EXISTS "volumeLiters" DECIMAL(12,3);
ALTER TABLE "VariantAttributeValue" ADD COLUMN IF NOT EXISTS "potDiameterCm" DECIMAL(12,3);
ALTER TABLE "VariantAttributeValue" ADD COLUMN IF NOT EXISTS "potHeightCm" DECIMAL(12,3);
ALTER TABLE "VariantAttributeValue" ADD COLUMN IF NOT EXISTS "tareWeightKg" DECIMAL(12,3);
ALTER TABLE "VariantAttributeValue" ADD COLUMN IF NOT EXISTS "colorHex" TEXT;

ALTER TABLE "VariantAttributeValue" DROP COLUMN IF EXISTS "code";
ALTER TABLE "VariantAttributeValue" DROP COLUMN IF EXISTS "semanticType";
ALTER TABLE "VariantAttributeValue" DROP COLUMN IF EXISTS "metadata";

DROP TYPE IF EXISTS "DimensionSemanticType";
