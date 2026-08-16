-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "codFeeAmount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productVariantId" TEXT NOT NULL,
    "priceType" TEXT NOT NULL DEFAULT 'роздріб',
    "currency" TEXT NOT NULL DEFAULT 'UAH',

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceHistory_productVariantId_priceType_currency_recordedAt_idx" ON "PriceHistory"("productVariantId", "priceType", "currency", "recordedAt");

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
