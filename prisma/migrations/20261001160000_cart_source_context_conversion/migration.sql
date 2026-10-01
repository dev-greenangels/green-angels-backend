-- Additive only: cart origin context + durable conversion link (no backfill).
ALTER TABLE "Cart" ADD COLUMN "countrySiteCode" TEXT,
ADD COLUMN "sourceHost" TEXT,
ADD COLUMN "locale" TEXT,
ADD COLUMN "currencyCode" TEXT,
ADD COLUMN "convertedOrderId" TEXT,
ADD COLUMN "convertedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Cart_convertedOrderId_key" ON "Cart"("convertedOrderId");
CREATE INDEX "Cart_countrySiteCode_idx" ON "Cart"("countrySiteCode");
CREATE INDEX "Cart_locale_idx" ON "Cart"("locale");
CREATE INDEX "Cart_convertedAt_idx" ON "Cart"("convertedAt");

ALTER TABLE "Cart" ADD CONSTRAINT "Cart_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
