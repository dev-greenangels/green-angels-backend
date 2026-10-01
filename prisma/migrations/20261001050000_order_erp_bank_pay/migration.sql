-- Manual BANK payment → ABRA banka (ext:GA:BANKPAY:{orderId}) ERP sub-FSM.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpBankPayExternalId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpBankPayNativeId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpBankPayNativeKod" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpBankPaySyncStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpBankPaySyncedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpBankPayLastError" TEXT;

CREATE INDEX IF NOT EXISTS "Order_erpBankPayExternalId_idx" ON "Order"("erpBankPayExternalId");
