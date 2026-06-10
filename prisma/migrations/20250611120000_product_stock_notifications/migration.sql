-- CreateTable
CREATE TABLE "ProductStockNotification" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductStockNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductStockNotification_productId_idx" ON "ProductStockNotification"("productId");

-- CreateIndex
CREATE INDEX "ProductStockNotification_productId_email_idx" ON "ProductStockNotification"("productId", "email");

-- CreateIndex
CREATE INDEX "ProductStockNotification_productId_phone_idx" ON "ProductStockNotification"("productId", "phone");

-- AddForeignKey
ALTER TABLE "ProductStockNotification" ADD CONSTRAINT "ProductStockNotification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
