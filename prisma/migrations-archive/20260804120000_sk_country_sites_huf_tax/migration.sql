-- Seed HUF currency + Order tax/FX/buyer snapshot fields for SK multi-domain

INSERT INTO "Currency" ("code", "symbol", "isoNumericCode", "decimals", "isActive", "sortOrder", "updatedAt")
VALUES ('HUF', 'Ft', 348, 0, true, 5, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "CurrencyTranslation" ("id", "locale", "name", "currencyCode")
SELECT gen_random_uuid()::text, v.locale, v.name, 'HUF'
FROM (VALUES
  ('uk', 'Форинт'),
  ('en', 'Hungarian forint'),
  ('sk', 'Maďarský forint'),
  ('hu', 'Magyar forint'),
  ('de', 'Ungarischer Forint')
) AS v(locale, name)
WHERE NOT EXISTS (
  SELECT 1 FROM "CurrencyTranslation" ct
  WHERE ct."currencyCode" = 'HUF' AND ct."locale" = v.locale
);

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "taxRatePercent" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "taxCountryCode" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "taxRegime" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "fxRateUsed" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "buyerType" TEXT;
