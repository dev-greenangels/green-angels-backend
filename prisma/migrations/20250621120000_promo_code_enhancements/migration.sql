-- Promo codes: combined discount + gift, exclusions, user targeting

ALTER TABLE "PromoCode" ADD COLUMN "discountType" "DiscountValueType";
ALTER TABLE "PromoCode" ADD COLUMN "excludeProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "PromoCode" ADD COLUMN "excludeVariantIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "PromoCode"
SET "discountType" = CASE
  WHEN "effect" = 'PERCENT' THEN 'PERCENT'::"DiscountValueType"
  WHEN "effect" = 'FIXED' THEN 'FIXED'::"DiscountValueType"
  ELSE NULL
END;

ALTER TABLE "PromoCode" DROP COLUMN "effect";

DROP TYPE IF EXISTS "PromoCodeEffect";

CREATE TABLE "PromoCodeUser" (
  "promoCodeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "PromoCodeUser_pkey" PRIMARY KEY ("promoCodeId", "userId")
);

CREATE INDEX "PromoCodeUser_userId_idx" ON "PromoCodeUser"("userId");

ALTER TABLE "PromoCodeUser"
  ADD CONSTRAINT "PromoCodeUser_promoCodeId_fkey"
  FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromoCodeUser"
  ADD CONSTRAINT "PromoCodeUser_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
