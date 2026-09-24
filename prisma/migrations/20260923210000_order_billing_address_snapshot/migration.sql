-- Immutable billing address snapshot on Order (nullable for legacy rows).
ALTER TABLE "Order" ADD COLUMN "billingStreet" TEXT;
ALTER TABLE "Order" ADD COLUMN "billingHouseNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "billingCity" TEXT;
ALTER TABLE "Order" ADD COLUMN "billingPostalCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "billingCountryCode" TEXT;
