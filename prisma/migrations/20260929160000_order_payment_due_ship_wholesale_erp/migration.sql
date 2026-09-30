-- Order: bank payment due + shipping SLA + Flexi advance/Stripe pay tracking
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentDueAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shipByDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpAdvanceExternalId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpAdvanceNativeId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpAdvanceKod" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpAdvanceSyncStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpAdvanceSyncedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpAdvanceLastError" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpStripePayExternalId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpStripePayNativeId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpStripePaySyncStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpStripePayLastError" TEXT;

CREATE INDEX IF NOT EXISTS "Order_paymentDueAt_idx" ON "Order"("paymentDueAt");
CREATE INDEX IF NOT EXISTS "Order_shipByDate_idx" ON "Order"("shipByDate");
CREATE INDEX IF NOT EXISTS "Order_status_paymentDueAt_idx" ON "Order"("status", "paymentDueAt");
CREATE INDEX IF NOT EXISTS "Order_erpAdvanceExternalId_idx" ON "Order"("erpAdvanceExternalId");
CREATE INDEX IF NOT EXISTS "Order_erpStripePayExternalId_idx" ON "Order"("erpStripePayExternalId");

-- WholesaleInquiry: Flexi Adresar sync state
ALTER TABLE "WholesaleInquiry" ADD COLUMN IF NOT EXISTS "externalErpId" TEXT;
ALTER TABLE "WholesaleInquiry" ADD COLUMN IF NOT EXISTS "erpNativeId" TEXT;
ALTER TABLE "WholesaleInquiry" ADD COLUMN IF NOT EXISTS "erpNativeKod" TEXT;
ALTER TABLE "WholesaleInquiry" ADD COLUMN IF NOT EXISTS "erpSyncStatus" TEXT;
ALTER TABLE "WholesaleInquiry" ADD COLUMN IF NOT EXISTS "erpSyncedAt" TIMESTAMP(3);
ALTER TABLE "WholesaleInquiry" ADD COLUMN IF NOT EXISTS "erpLastErrorMessage" TEXT;

CREATE INDEX IF NOT EXISTS "WholesaleInquiry_externalErpId_idx" ON "WholesaleInquiry"("externalErpId");
CREATE INDEX IF NOT EXISTS "WholesaleInquiry_erpSyncStatus_idx" ON "WholesaleInquiry"("erpSyncStatus");
