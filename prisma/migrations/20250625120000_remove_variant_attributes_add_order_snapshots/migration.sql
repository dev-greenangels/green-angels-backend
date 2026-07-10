-- OrderItem: snapshot поля замість живих join при відображенні
ALTER TABLE "OrderItem" ADD COLUMN "productName" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "productSlug" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "variantLabel" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "sku" TEXT;

-- Backfill існуючих позицій замовлень
UPDATE "OrderItem" AS oi
SET
  "productName" = COALESCE(pt.name, p.slug),
  "productSlug" = p.slug,
  "sku" = pv.sku,
  "variantLabel" = COALESCE(
    (
      SELECT string_agg(vavt.label, ' · ' ORDER BY va."sortOrder", vav."sortOrder")
      FROM "ProductVariantAttributeValue" pvav
      JOIN "VariantAttributeValue" vav ON vav.id = pvav."valueId"
      JOIN "VariantAttribute" va ON va.id = vav."attributeId"
      JOIN "VariantAttributeValueTranslation" vavt
        ON vavt."valueId" = vav.id AND vavt.locale = 'uk'
      WHERE pvav."variantId" = pv.id
    ),
    NULLIF(TRIM(pv.attributes->>'label'), '')
  )
FROM "ProductVariant" pv
JOIN "Product" p ON p.id = pv."productId"
LEFT JOIN "ProductTranslation" pt ON pt."productId" = p.id AND pt.locale = 'uk'
WHERE oi."productVariantId" = pv.id;

UPDATE "OrderItem"
SET
  "productName" = COALESCE("productName", 'Товар'),
  "productSlug" = COALESCE("productSlug", 'unknown')
WHERE "productName" IS NULL OR "productSlug" IS NULL;

ALTER TABLE "OrderItem" ALTER COLUMN "productName" SET NOT NULL;
ALTER TABLE "OrderItem" ALTER COLUMN "productSlug" SET NOT NULL;

-- productVariantId опційний (snapshot — джерело правди для UI)
ALTER TABLE "OrderItem" DROP CONSTRAINT IF EXISTS "OrderItem_productVariantId_fkey";
ALTER TABLE "OrderItem" ALTER COLUMN "productVariantId" DROP NOT NULL;
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_productVariantId_fkey"
  FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ProductVariant: прибрати дубльований JSON attributes
ALTER TABLE "ProductVariant" DROP COLUMN "attributes";
