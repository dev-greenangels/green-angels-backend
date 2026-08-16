-- Promo application scope, stacking, multi-promo orders

CREATE TYPE "DiscountApplicationScope" AS ENUM ('LINE_ITEMS', 'CART_TOTAL');
CREATE TYPE "PromoStackingMode" AS ENUM ('NONE', 'ALL', 'ALLOWLIST');

ALTER TABLE "PromoCode"
  ADD COLUMN "discountApplicationScope" "DiscountApplicationScope" NOT NULL DEFAULT 'LINE_ITEMS',
  ADD COLUMN "stackingMode" "PromoStackingMode" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "compatiblePromoCodeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "PromoCode"
SET "discountApplicationScope" = 'CART_TOTAL'
WHERE "discountType" = 'FIXED';

CREATE TABLE "OrderPromoCode" (
  "orderId" TEXT NOT NULL,
  "promoCodeId" TEXT NOT NULL,
  CONSTRAINT "OrderPromoCode_pkey" PRIMARY KEY ("orderId", "promoCodeId")
);

CREATE INDEX "OrderPromoCode_promoCodeId_idx" ON "OrderPromoCode"("promoCodeId");

ALTER TABLE "OrderPromoCode"
  ADD CONSTRAINT "OrderPromoCode_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderPromoCode"
  ADD CONSTRAINT "OrderPromoCode_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
