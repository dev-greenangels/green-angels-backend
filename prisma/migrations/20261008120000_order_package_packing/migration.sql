-- Physical shipping packages + packing completion stamp (warehouse ops prep).
-- Order.status=PACKED is not used as completion: it can be skipped or overwritten by TTN/SHIPPED.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "packingCompletedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "order_package" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "lengthCm" DECIMAL(12,3),
    "widthCm" DECIMAL(12,3),
    "heightCm" DECIMAL(12,3),
    "weightKg" DECIMAL(12,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_package_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_package_code_key" ON "order_package"("code");

CREATE UNIQUE INDEX IF NOT EXISTS "order_package_orderId_sequence_key" ON "order_package"("orderId", "sequence");

CREATE INDEX IF NOT EXISTS "order_package_orderId_idx" ON "order_package"("orderId");

CREATE INDEX IF NOT EXISTS "Order_packingCompletedAt_idx" ON "Order"("packingCompletedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_package_orderId_fkey'
  ) THEN
    ALTER TABLE "order_package"
      ADD CONSTRAINT "order_package_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
