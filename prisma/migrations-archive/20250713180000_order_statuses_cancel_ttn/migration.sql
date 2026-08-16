-- Order status definitions (CRUD + 1C/ERP externalCode)
CREATE TABLE "OrderStatusDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameUk" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameSk" TEXT,
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "externalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderStatusDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderStatusDefinition_code_key" ON "OrderStatusDefinition"("code");

-- Cancellation reasons
CREATE TABLE "CancellationReason" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameUk" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameSk" TEXT,
    "allowAdmin" BOOLEAN NOT NULL DEFAULT true,
    "allowUser" BOOLEAN NOT NULL DEFAULT false,
    "allowSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationReason_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CancellationReason_code_key" ON "CancellationReason"("code");

-- Order: TTN + cancellation
ALTER TABLE "Order" ADD COLUMN "trackingNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "trackingCarrier" TEXT;
ALTER TABLE "Order" ADD COLUMN "npDocumentRef" TEXT;
ALTER TABLE "Order" ADD COLUMN "trackingSyncedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "shippedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "cancellationReasonId" TEXT;
ALTER TABLE "Order" ADD COLUMN "cancellationSource" TEXT;
ALTER TABLE "Order" ADD COLUMN "cancellationNote" TEXT;
ALTER TABLE "Order" ADD COLUMN "cancelledAt" TIMESTAMP(3);

CREATE INDEX "Order_trackingNumber_idx" ON "Order"("trackingNumber");
CREATE INDEX "Order_cancellationReasonId_idx" ON "Order"("cancellationReasonId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_cancellationReasonId_fkey"
  FOREIGN KEY ("cancellationReasonId") REFERENCES "CancellationReason"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed system statuses
INSERT INTO "OrderStatusDefinition" ("id", "code", "nameUk", "nameEn", "nameSk", "color", "sortOrder", "isActive", "isSystem", "isTerminal", "externalCode", "updatedAt") VALUES
  ('10000000-0000-4000-8000-000000000001', 'PENDING', 'Очікує', 'Pending', 'Čaká', 'yellow', 10, true, true, false, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000002', 'AWAITING_PAYMENT', 'Очікує оплату', 'Awaiting payment', 'Čaká na platbu', 'orange', 20, true, true, false, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000003', 'PROCESSING', 'В обробці', 'Processing', 'Spracováva sa', 'blue', 30, true, true, false, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000004', 'SHIPPED', 'Відправлено', 'Shipped', 'Odoslané', 'purple', 40, true, true, false, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000005', 'DELIVERED', 'Доставлено', 'Delivered', 'Doručené', 'green', 50, true, true, true, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000006', 'CANCELLED', 'Скасовано', 'Cancelled', 'Zrušené', 'red', 60, true, true, true, NULL, CURRENT_TIMESTAMP);

-- Seed cancellation reasons
INSERT INTO "CancellationReason" ("id", "code", "nameUk", "nameEn", "nameSk", "allowAdmin", "allowUser", "allowSystem", "isActive", "sortOrder", "updatedAt") VALUES
  ('20000000-0000-4000-8000-000000000001', 'customer_request', 'Запит клієнта', 'Customer request', 'Žiadosť zákazníka', true, true, false, true, 10, CURRENT_TIMESTAMP),
  ('20000000-0000-4000-8000-000000000002', 'out_of_stock', 'Немає в наявності', 'Out of stock', 'Nie je na sklade', true, false, false, true, 20, CURRENT_TIMESTAMP),
  ('20000000-0000-4000-8000-000000000003', 'payment_failed', 'Проблема з оплатою', 'Payment issue', 'Problém s platbou', true, false, true, true, 30, CURRENT_TIMESTAMP),
  ('20000000-0000-4000-8000-000000000004', 'duplicate', 'Дубль замовлення', 'Duplicate order', 'Duplicitná objednávka', true, false, false, true, 40, CURRENT_TIMESTAMP),
  ('20000000-0000-4000-8000-000000000005', 'other', 'Інше', 'Other', 'Iné', true, true, true, true, 90, CURRENT_TIMESTAMP);
