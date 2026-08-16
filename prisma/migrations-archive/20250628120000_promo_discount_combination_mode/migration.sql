CREATE TYPE "PromoDiscountCombinationMode" AS ENUM ('STACK', 'BEST_PRICE');

ALTER TABLE "PromoCode"
ADD COLUMN "combinesWithOtherDiscounts" "PromoDiscountCombinationMode" NOT NULL DEFAULT 'BEST_PRICE';
