-- Checkout locale for email resume links; stock subscription host country site.
ALTER TABLE "Order" ADD COLUMN "locale" TEXT;
ALTER TABLE "ProductStockNotification" ADD COLUMN "countrySiteCode" TEXT;
