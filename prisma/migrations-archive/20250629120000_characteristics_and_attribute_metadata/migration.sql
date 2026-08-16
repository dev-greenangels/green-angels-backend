-- Enums (idempotent — may already exist from db push)
DO $$ BEGIN
  CREATE TYPE "CharacteristicValueType" AS ENUM ('SELECT', 'MULTI_SELECT', 'NUMBER', 'TEXT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DimensionSemanticType" AS ENUM ('EXACT', 'MIN', 'MAX', 'RANGE', 'PLUS', 'TEXT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Characteristic tables
CREATE TABLE IF NOT EXISTS "Characteristic" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "valueType" "CharacteristicValueType" NOT NULL,
    "unit" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFilterable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Characteristic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Characteristic_slug_key" ON "Characteristic"("slug");

CREATE TABLE IF NOT EXISTS "CharacteristicTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "characteristicId" TEXT NOT NULL,

    CONSTRAINT "CharacteristicTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CharacteristicTranslation_characteristicId_locale_key" ON "CharacteristicTranslation"("characteristicId", "locale");

CREATE TABLE IF NOT EXISTS "CharacteristicOption" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "characteristicId" TEXT NOT NULL,

    CONSTRAINT "CharacteristicOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CharacteristicOption_characteristicId_slug_key" ON "CharacteristicOption"("characteristicId", "slug");

CREATE TABLE IF NOT EXISTS "CharacteristicOptionTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "CharacteristicOptionTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CharacteristicOptionTranslation_optionId_locale_key" ON "CharacteristicOptionTranslation"("optionId", "locale");

CREATE TABLE IF NOT EXISTS "ProductCharacteristic" (
    "id" TEXT NOT NULL,
    "numberValue" DOUBLE PRECISION,
    "textValue" TEXT,
    "productId" TEXT NOT NULL,
    "characteristicId" TEXT NOT NULL,
    "optionId" TEXT,

    CONSTRAINT "ProductCharacteristic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductCharacteristic_productId_characteristicId_optionId_key" ON "ProductCharacteristic"("productId", "characteristicId", "optionId");

-- Variant attribute metadata
ALTER TABLE "VariantAttribute" ADD COLUMN IF NOT EXISTS "isFilterable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "VariantAttribute" ADD COLUMN IF NOT EXISTS "participatesInLabel" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "VariantAttributeValue" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "VariantAttributeValue" ADD COLUMN IF NOT EXISTS "semanticType" "DimensionSemanticType";
ALTER TABLE "VariantAttributeValue" ADD COLUMN IF NOT EXISTS "numericMin" DECIMAL(12,3);
ALTER TABLE "VariantAttributeValue" ADD COLUMN IF NOT EXISTS "numericMax" DECIMAL(12,3);
ALTER TABLE "VariantAttributeValue" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Foreign keys (idempotent)
DO $$ BEGIN
  ALTER TABLE "CharacteristicTranslation" ADD CONSTRAINT "CharacteristicTranslation_characteristicId_fkey" FOREIGN KEY ("characteristicId") REFERENCES "Characteristic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CharacteristicOption" ADD CONSTRAINT "CharacteristicOption_characteristicId_fkey" FOREIGN KEY ("characteristicId") REFERENCES "Characteristic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CharacteristicOptionTranslation" ADD CONSTRAINT "CharacteristicOptionTranslation_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CharacteristicOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductCharacteristic" ADD CONSTRAINT "ProductCharacteristic_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductCharacteristic" ADD CONSTRAINT "ProductCharacteristic_characteristicId_fkey" FOREIGN KEY ("characteristicId") REFERENCES "Characteristic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductCharacteristic" ADD CONSTRAINT "ProductCharacteristic_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CharacteristicOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Seed default filter characteristics
INSERT INTO "Characteristic" ("id", "slug", "valueType", "sortOrder", "isFilterable")
VALUES
  (gen_random_uuid()::text, 'sun-requirement', 'SELECT', 0, true),
  (gen_random_uuid()::text, 'soil-type', 'SELECT', 1, true),
  (gen_random_uuid()::text, 'hardiness-zone', 'SELECT', 2, true),
  (gen_random_uuid()::text, 'watering-needs', 'SELECT', 3, true),
  (gen_random_uuid()::text, 'height', 'TEXT', 4, false)
ON CONFLICT ("slug") DO NOTHING;

DO $$
DECLARE
  loc TEXT := 'uk';
BEGIN
  INSERT INTO "CharacteristicTranslation" ("id", "locale", "name", "characteristicId")
  SELECT gen_random_uuid()::text, loc, v.name, c.id
  FROM (VALUES
    ('sun-requirement', 'Освітлення'),
    ('soil-type', 'Тип ґрунту'),
    ('hardiness-zone', 'Зона морозостійкості'),
    ('watering-needs', 'Полив'),
    ('height', 'Висота')
  ) AS v(slug, name)
  JOIN "Characteristic" c ON c.slug = v.slug
  ON CONFLICT ("characteristicId", "locale") DO NOTHING;

  INSERT INTO "CharacteristicOption" ("id", "slug", "sortOrder", "characteristicId")
  SELECT gen_random_uuid()::text, v.option_slug, v.sort_order, c.id
  FROM (VALUES
    ('sun-requirement', 'full-sun', 0),
    ('sun-requirement', 'partial-shade', 1),
    ('sun-requirement', 'full-shade', 2),
    ('soil-type', 'acidic', 0),
    ('soil-type', 'neutral', 1),
    ('soil-type', 'alkaline', 2),
    ('soil-type', 'any', 3),
    ('hardiness-zone', '2-7', 0),
    ('hardiness-zone', '3-7', 1),
    ('hardiness-zone', '3-8', 2),
    ('hardiness-zone', '3-9', 3),
    ('hardiness-zone', '4-7', 4),
    ('hardiness-zone', '4-8', 5),
    ('watering-needs', 'low', 0),
    ('watering-needs', 'moderate', 1),
    ('watering-needs', 'high', 2)
  ) AS v(char_slug, option_slug, sort_order)
  JOIN "Characteristic" c ON c.slug = v.char_slug
  ON CONFLICT ("characteristicId", "slug") DO NOTHING;

  INSERT INTO "CharacteristicOptionTranslation" ("id", "locale", "label", "optionId")
  SELECT gen_random_uuid()::text, loc, v.label, o.id
  FROM (VALUES
    ('sun-requirement', 'full-sun', 'Повне сонце'),
    ('sun-requirement', 'partial-shade', 'Напівтінь'),
    ('sun-requirement', 'full-shade', 'Тінь'),
    ('soil-type', 'acidic', 'Кислий'),
    ('soil-type', 'neutral', 'Нейтральний'),
    ('soil-type', 'alkaline', 'Лужний'),
    ('soil-type', 'any', 'Будь-який'),
    ('hardiness-zone', '2-7', 'Зона 2-7'),
    ('hardiness-zone', '3-7', 'Зона 3-7'),
    ('hardiness-zone', '3-8', 'Зона 3-8'),
    ('hardiness-zone', '3-9', 'Зона 3-9'),
    ('hardiness-zone', '4-7', 'Зона 4-7'),
    ('hardiness-zone', '4-8', 'Зона 4-8'),
    ('watering-needs', 'low', 'Низькі'),
    ('watering-needs', 'moderate', 'Помірні'),
    ('watering-needs', 'high', 'Високі')
  ) AS v(char_slug, option_slug, label)
  JOIN "Characteristic" c ON c.slug = v.char_slug
  JOIN "CharacteristicOption" o ON o."characteristicId" = c.id AND o.slug = v.option_slug
  ON CONFLICT ("optionId", "locale") DO NOTHING;
END $$;
