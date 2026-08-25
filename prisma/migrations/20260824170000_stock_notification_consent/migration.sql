-- AlterTable
ALTER TABLE "ProductStockNotification" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'uk';
ALTER TABLE "ProductStockNotification" ADD COLUMN "consentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ProductStockNotification_notifiedAt_createdAt_idx" ON "ProductStockNotification"("notifiedAt", "createdAt");
