-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "companyStreet" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "companyCity" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "companyPostalCode" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "preferredShipDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_preferredShipDate_idx" ON "Order"("preferredShipDate");
