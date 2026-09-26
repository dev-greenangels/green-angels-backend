-- B2C invoice person snapshot (nullable for legacy rows; consumers fall back to customer*).
ALTER TABLE "Order" ADD COLUMN "billingFirstName" TEXT;
ALTER TABLE "Order" ADD COLUMN "billingLastName" TEXT;
