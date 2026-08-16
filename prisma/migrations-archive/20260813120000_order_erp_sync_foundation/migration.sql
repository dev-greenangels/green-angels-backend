-- ERP-SYNC-001: durable ERP sync state + native id columns (foundation only).
-- externalErpId remains correlation (ext:GA:{uuid}); native ids stay null until later batches.

ALTER TABLE "Order" ADD COLUMN "erpSyncStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "erpNativeId" TEXT;
ALTER TABLE "Order" ADD COLUMN "erpNativeKod" TEXT;
ALTER TABLE "Order" ADD COLUMN "erpSyncAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "erpLastErrorCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "erpLastErrorMessage" TEXT;
ALTER TABLE "Order" ADD COLUMN "erpLastSyncAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "erpSyncedAt" TIMESTAMP(3);

CREATE INDEX "Order_erpSyncStatus_idx" ON "Order"("erpSyncStatus");
CREATE INDEX "Order_erpNativeKod_idx" ON "Order"("erpNativeKod");

-- Backfill: correlation present ⇒ historically exported ⇒ SYNCED (native ids unknown).
UPDATE "Order"
SET "erpSyncStatus" = 'SYNCED',
    "erpSyncedAt" = COALESCE("erpSyncedAt", "createdAt"),
    "erpLastSyncAt" = COALESCE("erpLastSyncAt", "createdAt")
WHERE "externalErpId" IS NOT NULL
  AND TRIM("externalErpId") <> ''
  AND "erpSyncStatus" IS NULL;
