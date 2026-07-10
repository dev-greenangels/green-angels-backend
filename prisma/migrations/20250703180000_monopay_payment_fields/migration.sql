-- AlterTable
ALTER TABLE "Order" ADD COLUMN "monopayInvoiceId" TEXT;
ALTER TABLE "Order" ADD COLUMN "paymentStatus" TEXT;
ALTER TABLE "Order" ADD COLUMN "monopayModifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Order_monopayInvoiceId_key" ON "Order"("monopayInvoiceId");
