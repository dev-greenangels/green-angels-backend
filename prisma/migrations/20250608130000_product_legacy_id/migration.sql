-- AlterTable
ALTER TABLE "Product" ADD COLUMN "legacyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_legacyId_key" ON "Product"("legacyId");
