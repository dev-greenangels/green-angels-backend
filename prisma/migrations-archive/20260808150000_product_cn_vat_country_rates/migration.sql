-- AlterTable
ALTER TABLE "Product" ADD COLUMN "cnCode" TEXT;

-- CreateIndex
CREATE INDEX "Product_cnCode_idx" ON "Product"("cnCode");

-- CreateTable
CREATE TABLE "VatCountryRate" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "rateType" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "cnPrefixes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'seed',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VatCountryRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VatCountryRate_countryCode_rateType_idx" ON "VatCountryRate"("countryCode", "rateType");

-- CreateIndex
CREATE UNIQUE INDEX "VatCountryRate_countryCode_rateType_percent_key" ON "VatCountryRate"("countryCode", "rateType", "percent");

-- Seed standard + plant reduced rates (CN 0601/0602)
INSERT INTO "VatCountryRate" ("id", "countryCode", "rateType", "percent", "cnPrefixes", "source", "validFrom", "updatedAt") VALUES
  (gen_random_uuid()::text, 'sk', 'standard', 23, ARRAY[]::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'hu', 'standard', 27, ARRAY[]::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'at', 'standard', 20, ARRAY[]::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'at', 'reduced', 10, ARRAY['0601','0602']::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'cz', 'standard', 21, ARRAY[]::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'cz', 'reduced', 12, ARRAY['0601','0602']::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'de', 'standard', 19, ARRAY[]::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'de', 'reduced', 7, ARRAY['0601','0602']::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
