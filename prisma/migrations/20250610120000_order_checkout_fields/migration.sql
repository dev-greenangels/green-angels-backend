-- AlterTable
ALTER TABLE "Order" ADD COLUMN "customerEmail" TEXT,
ADD COLUMN "deliveryMethod" TEXT NOT NULL DEFAULT 'nova-poshta-branch',
ADD COLUMN "comment" TEXT;
