-- DiscountRule: quantityTiers become the sole discount source.
-- Local / pre-production: backfill tiers from legacy type/value, then drop columns.
-- Policy: rules with existing tiers keep those tiers (legacy base value discarded).
-- Rules without tiers get one tier @ minQuantity=1 from legacy type/value when value > 0.
-- Rules with no usable discount (no tiers and value <= 0) are deleted.

-- 1) Backfill missing tiers from legacy columns (value > 0 only)
INSERT INTO "DiscountRuleQuantityTier" (
  "id",
  "minQuantity",
  "type",
  "value",
  "sortOrder",
  "discountRuleId"
)
SELECT
  gen_random_uuid()::text,
  1,
  dr."type",
  dr."value",
  0,
  dr."id"
FROM "DiscountRule" dr
WHERE dr."value" > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "DiscountRuleQuantityTier" t
    WHERE t."discountRuleId" = dr."id"
  );

-- 2) Remove rules that still have no tiers (invalid under new model)
DELETE FROM "DiscountRule"
WHERE NOT EXISTS (
  SELECT 1
  FROM "DiscountRuleQuantityTier" t
  WHERE t."discountRuleId" = "DiscountRule"."id"
);

-- 3) Drop legacy columns
ALTER TABLE "DiscountRule" DROP COLUMN "type",
DROP COLUMN "value";
