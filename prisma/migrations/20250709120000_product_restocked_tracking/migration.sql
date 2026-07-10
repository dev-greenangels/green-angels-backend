-- Track when a product becomes available again after being fully out of stock.
ALTER TABLE "Product" ADD COLUMN "restockedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "fullyOutOfStockAt" TIMESTAMP(3);

UPDATE "Product" AS p
SET "restockedAt" = p."createdAt"
WHERE EXISTS (
  SELECT 1
  FROM "ProductVariant" AS v
  WHERE v."productId" = p."id" AND v."stock" > 0
);
