-- Pricing / Sales Prices / DiscountRule / PromoCode commercial expand (Phase A–D).
-- Additive only for Coolify auto-deploy.
--
-- Intentionally does NOT drop "ProductVariantQuantityPrice" or "VariantQuantityDiscountType".
-- New Prisma Client / runtime no longer use that table; orphan rows stay until a later
-- explicit cleanup migration after production data review.

-- CreateEnum
CREATE TYPE "SalesPriceScope" AS ENUM ('ALL', 'GROUP', 'COMPANY');

-- CreateEnum
CREATE TYPE "PromoEligibleAudience" AS ENUM ('RETAIL', 'WHOLESALER');

-- CreateEnum
CREATE TYPE "PromoEligiblePriceSource" AS ENUM ('ALL', 'GROUP', 'COMPANY');

-- CreateEnum
CREATE TYPE "PromoApplicationScope" AS ENUM ('PRODUCTS', 'PRODUCTS_AND_SHIPPING', 'SHIPPING_ONLY');

-- AlterEnum (DiscountRule absolute unit price; PromoCode does not use FIXED_PRICE)
ALTER TYPE "DiscountValueType" ADD VALUE IF NOT EXISTS 'FIXED_PRICE';

-- AlterTable ContractorProfile (Flexi firma / price-group mapping)
ALTER TABLE "ContractorProfile" ADD COLUMN "flexiFirmaKod" TEXT,
ADD COLUMN "flexiSkupCenKod" TEXT;

-- AlterTable DiscountRule
ALTER TABLE "DiscountRule" ADD COLUMN "eligibleAudiences" "PromoEligibleAudience"[] DEFAULT ARRAY[]::"PromoEligibleAudience"[],
ADD COLUMN "filterCriteria" JSONB;

-- AlterTable PromoCode (backward-compatible defaults = all audiences / sources / products)
ALTER TABLE "PromoCode" ADD COLUMN "applicationScope" "PromoApplicationScope" NOT NULL DEFAULT 'PRODUCTS',
ADD COLUMN "eligibleAudiences" "PromoEligibleAudience"[] NOT NULL DEFAULT ARRAY['RETAIL', 'WHOLESALER']::"PromoEligibleAudience"[],
ADD COLUMN "eligiblePriceSources" "PromoEligiblePriceSource"[] NOT NULL DEFAULT ARRAY['ALL', 'GROUP', 'COMPANY']::"PromoEligiblePriceSource"[];

-- AlterTable Order (commercial promo snapshot)
ALTER TABLE "Order" ADD COLUMN "promoCommercialSnapshot" JSONB,
ADD COLUMN "promoFixedDiscountAmount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "FlexiPriceGroup" (
    "id" TEXT NOT NULL,
    "flexiId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlexiPriceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSalesPrice" (
    "id" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "flexiOdberatelId" TEXT NOT NULL,
    "scope" "SalesPriceScope" NOT NULL,
    "priceGroupCode" TEXT,
    "flexiFirmaKod" TEXT,
    "currency" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,4) NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "limMnoz2" INTEGER NOT NULL DEFAULT 0,
    "unitPrice2" DECIMAL(12,4),
    "limMnoz3" INTEGER NOT NULL DEFAULT 0,
    "unitPrice3" DECIMAL(12,4),
    "limMnoz4" INTEGER NOT NULL DEFAULT 0,
    "unitPrice4" DECIMAL(12,4),
    "limMnoz5" INTEGER NOT NULL DEFAULT 0,
    "unitPrice5" DECIMAL(12,4),
    "flexiLastUpdate" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSalesPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRuleQuantityTier" (
    "id" TEXT NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "type" "DiscountValueType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "discountRuleId" TEXT NOT NULL,

    CONSTRAINT "DiscountRuleQuantityTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlexiPriceGroup_flexiId_key" ON "FlexiPriceGroup"("flexiId");

-- CreateIndex
CREATE UNIQUE INDEX "FlexiPriceGroup_code_key" ON "FlexiPriceGroup"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSalesPrice_flexiOdberatelId_key" ON "ProductSalesPrice"("flexiOdberatelId");

-- CreateIndex
CREATE INDEX "ProductSalesPrice_productVariantId_scope_currency_idx" ON "ProductSalesPrice"("productVariantId", "scope", "currency");

-- CreateIndex
CREATE INDEX "ProductSalesPrice_priceGroupCode_idx" ON "ProductSalesPrice"("priceGroupCode");

-- CreateIndex
CREATE INDEX "ProductSalesPrice_flexiFirmaKod_idx" ON "ProductSalesPrice"("flexiFirmaKod");

-- CreateIndex
CREATE INDEX "ProductSalesPrice_scope_validFrom_validTo_idx" ON "ProductSalesPrice"("scope", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "DiscountRuleQuantityTier_discountRuleId_idx" ON "DiscountRuleQuantityTier"("discountRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRuleQuantityTier_discountRuleId_minQuantity_key" ON "DiscountRuleQuantityTier"("discountRuleId", "minQuantity");

-- CreateIndex
CREATE INDEX "ContractorProfile_flexiFirmaKod_idx" ON "ContractorProfile"("flexiFirmaKod");

-- CreateIndex
CREATE INDEX "ContractorProfile_flexiSkupCenKod_idx" ON "ContractorProfile"("flexiSkupCenKod");

-- CreateIndex
CREATE INDEX "DiscountRule_isActive_idx" ON "DiscountRule"("isActive");

-- AddForeignKey
ALTER TABLE "ProductSalesPrice" ADD CONSTRAINT "ProductSalesPrice_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRuleQuantityTier" ADD CONSTRAINT "DiscountRuleQuantityTier_discountRuleId_fkey" FOREIGN KEY ("discountRuleId") REFERENCES "DiscountRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
