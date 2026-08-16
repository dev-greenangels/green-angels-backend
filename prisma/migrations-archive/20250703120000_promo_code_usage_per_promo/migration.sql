-- Allow multiple promo usage rows per order (one per applied promo code).
DROP INDEX IF EXISTS "PromoCodeUsage_orderId_key";

CREATE UNIQUE INDEX "PromoCodeUsage_orderId_promoCodeId_key"
  ON "PromoCodeUsage"("orderId", "promoCodeId");
