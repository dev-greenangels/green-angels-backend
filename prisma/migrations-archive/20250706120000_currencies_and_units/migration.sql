-- CreateEnum
CREATE TYPE "UnitOfMeasureType" AS ENUM ('COUNT', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA');

-- CreateTable
CREATE TABLE "Currency" (
    "code" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "isoNumericCode" INTEGER,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CurrencyTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,

    CONSTRAINT "CurrencyTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" "UnitOfMeasureType" NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitOfMeasureTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "UnitOfMeasureTranslation_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "salesUnitId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyTranslation_currencyCode_locale_key" ON "CurrencyTranslation"("currencyCode", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_code_key" ON "UnitOfMeasure"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasureTranslation_unitId_locale_key" ON "UnitOfMeasureTranslation"("unitId", "locale");

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_salesUnitId_fkey" FOREIGN KEY ("salesUnitId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyTranslation" ADD CONSTRAINT "CurrencyTranslation_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitOfMeasureTranslation" ADD CONSTRAINT "UnitOfMeasureTranslation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed currencies
INSERT INTO "Currency" ("code", "symbol", "isoNumericCode", "decimals", "isActive", "sortOrder", "updatedAt") VALUES
  ('UAH', '₴', 980, 2, true, 1, CURRENT_TIMESTAMP),
  ('EUR', '€', 978, 2, true, 2, CURRENT_TIMESTAMP),
  ('PLN', 'zł', 985, 2, true, 3, CURRENT_TIMESTAMP),
  ('CZK', 'Kč', 203, 2, true, 4, CURRENT_TIMESTAMP);

INSERT INTO "CurrencyTranslation" ("id", "locale", "name", "currencyCode") VALUES
  (gen_random_uuid()::text, 'uk', 'Гривня', 'UAH'),
  (gen_random_uuid()::text, 'en', 'Ukrainian hryvnia', 'UAH'),
  (gen_random_uuid()::text, 'sk', 'Ukrajinská hrivna', 'UAH'),
  (gen_random_uuid()::text, 'uk', 'Євро', 'EUR'),
  (gen_random_uuid()::text, 'en', 'Euro', 'EUR'),
  (gen_random_uuid()::text, 'sk', 'Euro', 'EUR'),
  (gen_random_uuid()::text, 'uk', 'Злотий', 'PLN'),
  (gen_random_uuid()::text, 'en', 'Polish zloty', 'PLN'),
  (gen_random_uuid()::text, 'sk', 'Poľský zlotý', 'PLN'),
  (gen_random_uuid()::text, 'uk', 'Чеська крона', 'CZK'),
  (gen_random_uuid()::text, 'en', 'Czech koruna', 'CZK'),
  (gen_random_uuid()::text, 'sk', 'Česká koruna', 'CZK');

-- Seed units of measure
INSERT INTO "UnitOfMeasure" ("id", "code", "symbol", "type", "decimals", "isActive", "sortOrder", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000001', 'pcs', 'шт', 'COUNT', 0, true, 1, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000002', 'kg', 'кг', 'WEIGHT', 3, true, 2, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000003', 'g', 'г', 'WEIGHT', 0, true, 3, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000004', 'l', 'л', 'VOLUME', 2, true, 4, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000005', 'ml', 'мл', 'VOLUME', 0, true, 5, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000006', 'cm', 'см', 'LENGTH', 0, true, 6, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000007', 'm', 'м', 'LENGTH', 2, true, 7, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000008', 'm2', 'м²', 'AREA', 2, true, 8, CURRENT_TIMESTAMP);

INSERT INTO "UnitOfMeasureTranslation" ("id", "locale", "name", "unitId") VALUES
  (gen_random_uuid()::text, 'uk', 'Штука', '00000000-0000-4000-8000-000000000001'),
  (gen_random_uuid()::text, 'en', 'Piece', '00000000-0000-4000-8000-000000000001'),
  (gen_random_uuid()::text, 'sk', 'Kus', '00000000-0000-4000-8000-000000000001'),
  (gen_random_uuid()::text, 'uk', 'Кілограм', '00000000-0000-4000-8000-000000000002'),
  (gen_random_uuid()::text, 'en', 'Kilogram', '00000000-0000-4000-8000-000000000002'),
  (gen_random_uuid()::text, 'sk', 'Kilogram', '00000000-0000-4000-8000-000000000002'),
  (gen_random_uuid()::text, 'uk', 'Грам', '00000000-0000-4000-8000-000000000003'),
  (gen_random_uuid()::text, 'en', 'Gram', '00000000-0000-4000-8000-000000000003'),
  (gen_random_uuid()::text, 'sk', 'Gram', '00000000-0000-4000-8000-000000000003'),
  (gen_random_uuid()::text, 'uk', 'Літр', '00000000-0000-4000-8000-000000000004'),
  (gen_random_uuid()::text, 'en', 'Litre', '00000000-0000-4000-8000-000000000004'),
  (gen_random_uuid()::text, 'sk', 'Liter', '00000000-0000-4000-8000-000000000004'),
  (gen_random_uuid()::text, 'uk', 'Мілілітр', '00000000-0000-4000-8000-000000000005'),
  (gen_random_uuid()::text, 'en', 'Millilitre', '00000000-0000-4000-8000-000000000005'),
  (gen_random_uuid()::text, 'sk', 'Mililiter', '00000000-0000-4000-8000-000000000005'),
  (gen_random_uuid()::text, 'uk', 'Сантиметр', '00000000-0000-4000-8000-000000000006'),
  (gen_random_uuid()::text, 'en', 'Centimetre', '00000000-0000-4000-8000-000000000006'),
  (gen_random_uuid()::text, 'sk', 'Centimeter', '00000000-0000-4000-8000-000000000006'),
  (gen_random_uuid()::text, 'uk', 'Метр', '00000000-0000-4000-8000-000000000007'),
  (gen_random_uuid()::text, 'en', 'Metre', '00000000-0000-4000-8000-000000000007'),
  (gen_random_uuid()::text, 'sk', 'Meter', '00000000-0000-4000-8000-000000000007'),
  (gen_random_uuid()::text, 'uk', 'Квадратний метр', '00000000-0000-4000-8000-000000000008'),
  (gen_random_uuid()::text, 'en', 'Square metre', '00000000-0000-4000-8000-000000000008'),
  (gen_random_uuid()::text, 'sk', 'Štvorcový meter', '00000000-0000-4000-8000-000000000008');

-- Default sales unit for existing variants
UPDATE "ProductVariant" SET "salesUnitId" = '00000000-0000-4000-8000-000000000001' WHERE "salesUnitId" IS NULL;

-- Link existing prices to Currency (FK)
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Default commerce settings
INSERT INTO "Settings" ("id", "key", "value")
VALUES (
  gen_random_uuid()::text,
  'commerce.defaults',
  '{"defaultCurrencyCode":"UAH","defaultSalesUnitCode":"pcs"}'
)
ON CONFLICT ("key") DO NOTHING;
