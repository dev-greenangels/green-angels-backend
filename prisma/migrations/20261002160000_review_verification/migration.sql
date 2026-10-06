-- Review verification (Phase 1): NONE | VERIFIED_CUSTOMER | VERIFIED_PURCHASE
-- Existing rows default to NONE / null orderId / empty labels.

CREATE TYPE "ReviewVerificationType" AS ENUM ('NONE', 'VERIFIED_CUSTOMER', 'VERIFIED_PURCHASE');

ALTER TABLE "Review"
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "verificationType" "ReviewVerificationType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "purchasedVariantLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Review_orderId_idx" ON "Review"("orderId");
CREATE INDEX "Review_verificationType_idx" ON "Review"("verificationType");

-- One store review per Order (productId IS NULL).
CREATE UNIQUE INDEX "Review_orderId_store_key"
  ON "Review"("orderId")
  WHERE "orderId" IS NOT NULL AND "productId" IS NULL;

-- One product review per Product per Order.
CREATE UNIQUE INDEX "Review_orderId_productId_product_key"
  ON "Review"("orderId", "productId")
  WHERE "orderId" IS NOT NULL AND "productId" IS NOT NULL;
