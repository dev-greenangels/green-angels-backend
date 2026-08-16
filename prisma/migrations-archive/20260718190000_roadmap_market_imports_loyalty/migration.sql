-- CreateEnum
CREATE TYPE "DiscountRuleCombinationMode" AS ENUM ('BEST_PRICE', 'STACK', 'MAX_OF');





-- AlterTable
ALTER TABLE "DiscountRule" ADD COLUMN     "combinesWithOtherDiscounts" "DiscountRuleCombinationMode" NOT NULL DEFAULT 'BEST_PRICE',
ADD COLUMN     "excludeCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "excludeProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "excludeVariantIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "createAccountRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "legacyReference" TEXT,
ADD COLUMN     "legacySource" TEXT,
ADD COLUMN     "paymentProvider" TEXT,
ADD COLUMN     "pointsDiscountAmount" DECIMAL(10,2),
ADD COLUMN     "privacyConsentAt" TIMESTAMP(3),
ADD COLUMN     "privacyConsentVersion" TEXT,
ADD COLUMN     "stripePaymentId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "legacyId" TEXT,
ADD COLUMN     "legacySource" TEXT,
ADD COLUMN     "marketingConsentAt" TIMESTAMP(3),
ADD COLUMN     "newsletter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "optin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DiscountRuleUser" (
    "discountRuleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DiscountRuleUser_pkey" PRIMARY KEY ("discountRuleId","userId")
);

-- CreateTable
CREATE TABLE "ReferralProgram" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "refereeDiscountType" "DiscountValueType" NOT NULL DEFAULT 'PERCENT',
    "refereeDiscountValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "referrerPoints" INTEGER NOT NULL DEFAULT 0,
    "minOrderSubtotal" DECIMAL(10,2),
    "maxRefereeDiscount" DECIMAL(10,2),
    "excludeProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onlyForRoles" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "cookieDays" INTEGER NOT NULL DEFAULT 30,
    "pointsExpireDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralProgramGroup" (
    "programId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "ReferralProgramGroup_pkey" PRIMARY KEY ("programId","groupId")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralAttribution" (
    "id" TEXT NOT NULL,
    "referralCodeId" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "refereeUserId" TEXT,
    "orderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardedAt" TIMESTAMP(3),

    CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscountRuleUser_userId_idx" ON "DiscountRuleUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_userId_key" ON "ReferralCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralAttribution_orderId_key" ON "ReferralAttribution"("orderId");

-- CreateIndex
CREATE INDEX "ReferralAttribution_referrerUserId_createdAt_idx" ON "ReferralAttribution"("referrerUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ReferralAttribution_referralCodeId_idx" ON "ReferralAttribution"("referralCodeId");

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_userId_createdAt_idx" ON "PointsLedgerEntry"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_orderId_idx" ON "PointsLedgerEntry"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripePaymentId_key" ON "Order"("stripePaymentId");

-- CreateIndex
CREATE INDEX "Order_legacyId_idx" ON "Order"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_legacySource_legacyId_key" ON "Order"("legacySource", "legacyId");

-- CreateIndex
CREATE INDEX "User_legacyId_idx" ON "User"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_legacySource_legacyId_key" ON "User"("legacySource", "legacyId");

-- AddForeignKey
ALTER TABLE "DiscountRuleUser" ADD CONSTRAINT "DiscountRuleUser_discountRuleId_fkey" FOREIGN KEY ("discountRuleId") REFERENCES "DiscountRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRuleUser" ADD CONSTRAINT "DiscountRuleUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralProgramGroup" ADD CONSTRAINT "ReferralProgramGroup_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralProgramGroup" ADD CONSTRAINT "ReferralProgramGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_refereeUserId_fkey" FOREIGN KEY ("refereeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedgerEntry" ADD CONSTRAINT "PointsLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedgerEntry" ADD CONSTRAINT "PointsLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
