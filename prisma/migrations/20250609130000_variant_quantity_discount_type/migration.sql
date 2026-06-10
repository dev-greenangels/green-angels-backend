-- CreateEnum
CREATE TYPE "VariantQuantityDiscountType" AS ENUM ('FIXED_PRICE', 'PERCENT');

-- AlterTable
ALTER TABLE "ProductVariantQuantityPrice" ADD COLUMN "discountType" "VariantQuantityDiscountType" NOT NULL DEFAULT 'FIXED_PRICE';

ALTER TABLE "ProductVariantQuantityPrice" RENAME COLUMN "pricePerUnit" TO "value";
