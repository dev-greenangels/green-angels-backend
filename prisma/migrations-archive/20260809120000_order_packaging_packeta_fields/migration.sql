-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "packagingBoxCount" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "packagingPalletCount" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryBranchLabel" TEXT;
