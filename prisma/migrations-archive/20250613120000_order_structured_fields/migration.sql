-- Add structured customer, receiver and delivery columns
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerFirstName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerLastName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerPatronymic" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "receiverFirstName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "receiverLastName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "receiverPatronymic" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryBranch" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryStreet" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryHouseNumber" TEXT;

-- Migrate customer name (format: "Прізвище Ім'я По батькові")
UPDATE "Order" SET
  "customerLastName" = COALESCE(NULLIF(split_part("customerName", ' ', 1), ''), "customerName"),
  "customerFirstName" = COALESCE(NULLIF(split_part("customerName", ' ', 2), ''), split_part("customerName", ' ', 1)),
  "customerPatronymic" = NULLIF(split_part("customerName", ' ', 3), '')
WHERE "customerFirstName" IS NULL;

-- Migrate receiver name
UPDATE "Order" SET
  "receiverLastName" = split_part("receiverName", ' ', 1),
  "receiverFirstName" = COALESCE(NULLIF(split_part("receiverName", ' ', 2), ''), split_part("receiverName", ' ', 1)),
  "receiverPatronymic" = NULLIF(split_part("receiverName", ' ', 3), '')
WHERE ("receiverName" IS NOT NULL AND trim("receiverName") <> '')
  AND "receiverFirstName" IS NULL;

-- Copy customer to receiver when receiver was not set
UPDATE "Order" SET
  "receiverFirstName" = "customerFirstName",
  "receiverLastName" = "customerLastName",
  "receiverPatronymic" = "customerPatronymic",
  "receiverPhone" = COALESCE("receiverPhone", "customerPhone")
WHERE "receiverFirstName" IS NULL OR trim("receiverFirstName") = '';

-- Migrate delivery fields
UPDATE "Order" SET "deliveryBranch" = "deliveryWarehouse"
WHERE "deliveryMethod" = 'nova-poshta-branch' AND "deliveryBranch" IS NULL;

UPDATE "Order" SET
  "deliveryStreet" = split_part("deliveryWarehouse", ', ', 1),
  "deliveryHouseNumber" = NULLIF(trim(split_part("deliveryWarehouse", ', ', 2)), '')
WHERE "deliveryMethod" = 'nova-poshta-address' AND "deliveryStreet" IS NULL;

ALTER TABLE "Order" ALTER COLUMN "deliveryCity" DROP NOT NULL;

UPDATE "Order" SET "deliveryCity" = NULL
WHERE "deliveryMethod" = 'pickup';

ALTER TABLE "Order" ALTER COLUMN "customerFirstName" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "customerLastName" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "receiverFirstName" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "receiverLastName" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "receiverPhone" SET NOT NULL;

ALTER TABLE "Order" DROP COLUMN IF EXISTS "customerName";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "receiverName";
ALTER TABLE "Order" DROP COLUMN IF EXISTS "deliveryWarehouse";
