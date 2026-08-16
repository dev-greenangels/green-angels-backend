-- SK checkout: courier PSČ, destination country, optional receiver company
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryPostalCode" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryCountryCode" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "receiverCompanyName" TEXT;
