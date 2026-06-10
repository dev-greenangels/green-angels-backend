-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "availableFrom" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProductVariantQuantityPrice" (
    "id" TEXT NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "pricePerUnit" DECIMAL(10,2) NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "productVariantId" TEXT NOT NULL,

    CONSTRAINT "ProductVariantQuantityPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductVariantQuantityPrice_productVariantId_idx" ON "ProductVariantQuantityPrice"("productVariantId");

-- AddForeignKey
ALTER TABLE "ProductVariantQuantityPrice" ADD CONSTRAINT "ProductVariantQuantityPrice_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
