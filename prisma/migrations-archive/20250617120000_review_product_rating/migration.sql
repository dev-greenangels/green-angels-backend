-- AlterTable
ALTER TABLE "Review" ADD COLUMN "productId" TEXT,
ADD COLUMN "rating" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "legacyId" TEXT,
ADD COLUMN "legacySource" TEXT,
ADD COLUMN "importedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Review_productId_status_createdAt_idx" ON "Review"("productId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Review_rating_idx" ON "Review"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "Review_legacySource_legacyId_key" ON "Review"("legacySource", "legacyId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
