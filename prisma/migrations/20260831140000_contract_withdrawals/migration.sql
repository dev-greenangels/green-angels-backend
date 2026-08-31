-- CreateEnum
CREATE TYPE "ContractWithdrawalScope" AS ENUM ('ENTIRE_ORDER', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ContractWithdrawalSource" AS ENUM ('PUBLIC_FORM', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "ContractWithdrawalStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CLOSED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "onlineWithdrawalActionEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ContractWithdrawal" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "orderId" TEXT,
    "submittedOrderNumber" TEXT NOT NULL,
    "userId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "scope" "ContractWithdrawalScope" NOT NULL,
    "partialItemsText" TEXT,
    "locale" TEXT NOT NULL,
    "source" "ContractWithdrawalSource" NOT NULL,
    "status" "ContractWithdrawalStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgementSentAt" TIMESTAMP(3),
    "acknowledgementLocale" TEXT,
    "acknowledgementSubjectSnapshot" TEXT,
    "acknowledgementBodySnapshot" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractWithdrawalLineItem" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "productVariantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "skuSnapshot" TEXT,

    CONSTRAINT "ContractWithdrawalLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractWithdrawal_referenceNumber_key" ON "ContractWithdrawal"("referenceNumber");

-- CreateIndex
CREATE INDEX "ContractWithdrawal_orderId_idx" ON "ContractWithdrawal"("orderId");

-- CreateIndex
CREATE INDEX "ContractWithdrawal_userId_idx" ON "ContractWithdrawal"("userId");

-- CreateIndex
CREATE INDEX "ContractWithdrawal_customerEmail_idx" ON "ContractWithdrawal"("customerEmail");

-- CreateIndex
CREATE INDEX "ContractWithdrawal_submittedOrderNumber_idx" ON "ContractWithdrawal"("submittedOrderNumber");

-- CreateIndex
CREATE INDEX "ContractWithdrawal_status_submittedAt_idx" ON "ContractWithdrawal"("status", "submittedAt" DESC);

-- CreateIndex
CREATE INDEX "ContractWithdrawal_submittedAt_idx" ON "ContractWithdrawal"("submittedAt" DESC);

-- CreateIndex
CREATE INDEX "ContractWithdrawalLineItem_withdrawalId_idx" ON "ContractWithdrawalLineItem"("withdrawalId");

-- CreateIndex
CREATE INDEX "Order_deliveredAt_idx" ON "Order"("deliveredAt");

-- AddForeignKey
ALTER TABLE "ContractWithdrawal" ADD CONSTRAINT "ContractWithdrawal_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractWithdrawal" ADD CONSTRAINT "ContractWithdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractWithdrawalLineItem" ADD CONSTRAINT "ContractWithdrawalLineItem_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "ContractWithdrawal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
