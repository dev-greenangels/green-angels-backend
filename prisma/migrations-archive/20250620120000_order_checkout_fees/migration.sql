-- AlterTable
ALTER TABLE "Order" ADD COLUMN "productsSubtotal" DECIMAL(10,2),
ADD COLUMN "deliveryAmount" DECIMAL(10,2),
ADD COLUMN "packagingAmount" DECIMAL(10,2),
ADD COLUMN "taxAmount" DECIMAL(10,2);
