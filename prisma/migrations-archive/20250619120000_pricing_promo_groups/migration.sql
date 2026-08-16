-- CreateEnum
CREATE TYPE "PromoCodeEffect" AS ENUM ('PERCENT', 'FIXED', 'FREE_GIFT');

-- CreateTable
CREATE TABLE "CustomerGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCustomerGroup" (
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "UserCustomerGroup_pkey" PRIMARY KEY ("userId","groupId")
);

-- AlterTable
ALTER TABLE "DiscountRule" ADD COLUMN "targetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "minCartSubtotal" DECIMAL(10,2),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "DiscountRuleGroup" (
    "discountRuleId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "DiscountRuleGroup_pkey" PRIMARY KEY ("discountRuleId","groupId")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "effect" "PromoCodeEffect" NOT NULL,
    "value" DECIMAL(10,2),
    "target" "DiscountTarget" NOT NULL,
    "targetId" TEXT,
    "targetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minCartSubtotal" DECIMAL(10,2),
    "giftVariantId" TEXT,
    "giftQuantity" INTEGER NOT NULL DEFAULT 1,
    "usageLimitTotal" INTEGER,
    "usageLimitPerUser" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCodeGroup" (
    "promoCodeId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "PromoCodeGroup_pkey" PRIMARY KEY ("promoCodeId","groupId")
);

-- CreateTable
CREATE TABLE "PromoCodeUsage" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeUsage_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "promoCodeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerGroup_slug_key" ON "CustomerGroup"("slug");

-- CreateIndex
CREATE INDEX "UserCustomerGroup_groupId_idx" ON "UserCustomerGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCodeUsage_orderId_key" ON "PromoCodeUsage"("orderId");

-- CreateIndex
CREATE INDEX "PromoCodeUsage_promoCodeId_userId_idx" ON "PromoCodeUsage"("promoCodeId", "userId");

-- AddForeignKey
ALTER TABLE "UserCustomerGroup" ADD CONSTRAINT "UserCustomerGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomerGroup" ADD CONSTRAINT "UserCustomerGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRuleGroup" ADD CONSTRAINT "DiscountRuleGroup_discountRuleId_fkey" FOREIGN KEY ("discountRuleId") REFERENCES "DiscountRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRuleGroup" ADD CONSTRAINT "DiscountRuleGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeGroup" ADD CONSTRAINT "PromoCodeGroup_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeGroup" ADD CONSTRAINT "PromoCodeGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default customer groups
INSERT INTO "CustomerGroup" ("id", "name", "slug", "description", "isActive", "createdAt", "updatedAt")
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Роздріб', 'retail', 'Звичайні покупці', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000002', 'Гурт', 'wholesale', 'Оптові клієнти та контрагенти', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
