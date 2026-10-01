-- Option A: one Cart = one shopping attempt.
-- Forward migration: deploy state of 20261001160000 is not assumed for all envs;
-- this migration is safe if convertedOrderId columns exist (local) or are absent.

-- 1) Add closedAt on Cart
ALTER TABLE "Cart" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

-- 2) Add Order.cartId (originating attempt)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cartId" TEXT;

-- 3) Backfill from sticky Cart.convertedOrderId when unambiguous (column may exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Cart' AND column_name = 'convertedOrderId'
  ) THEN
    -- Link Order.cartId from Cart.convertedOrderId
    UPDATE "Order" o
    SET "cartId" = c.id
    FROM "Cart" c
    WHERE c."convertedOrderId" = o.id
      AND o."cartId" IS NULL;

    -- Close converted carts using convertedAt when present
    UPDATE "Cart"
    SET "closedAt" = COALESCE("convertedAt", "updatedAt")
    WHERE "convertedOrderId" IS NOT NULL
      AND "closedAt" IS NULL;
  END IF;
END $$;

-- 4) Drop old sticky conversion FK/index/columns if present
ALTER TABLE "Cart" DROP CONSTRAINT IF EXISTS "Cart_convertedOrderId_fkey";
DROP INDEX IF EXISTS "Cart_convertedOrderId_key";
DROP INDEX IF EXISTS "Cart_convertedAt_idx";

ALTER TABLE "Cart" DROP COLUMN IF EXISTS "convertedOrderId";
ALTER TABLE "Cart" DROP COLUMN IF EXISTS "convertedAt";

-- 5) Drop absolute owner uniqueness (allows many historical carts per owner)
DROP INDEX IF EXISTS "Cart_userId_key";
DROP INDEX IF EXISTS "Cart_guestSessionId_key";

-- Non-unique owner lookup indexes
CREATE INDEX IF NOT EXISTS "Cart_userId_idx" ON "Cart"("userId");
CREATE INDEX IF NOT EXISTS "Cart_guestSessionId_idx" ON "Cart"("guestSessionId");
CREATE INDEX IF NOT EXISTS "Cart_closedAt_idx" ON "Cart"("closedAt");
CREATE INDEX IF NOT EXISTS "Cart_userId_closedAt_idx" ON "Cart"("userId", "closedAt");
CREATE INDEX IF NOT EXISTS "Cart_guestSessionId_closedAt_idx" ON "Cart"("guestSessionId", "closedAt");

-- 6) DB-enforced: max one OPEN cart per owner
CREATE UNIQUE INDEX IF NOT EXISTS "Cart_one_open_per_user"
  ON "Cart"("userId")
  WHERE "userId" IS NOT NULL AND "closedAt" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Cart_one_open_per_guest"
  ON "Cart"("guestSessionId")
  WHERE "guestSessionId" IS NOT NULL AND "closedAt" IS NULL;

-- 7) Order.cartId unique + FK (SetNull on Cart delete — Orders retained)
CREATE UNIQUE INDEX IF NOT EXISTS "Order_cartId_key" ON "Order"("cartId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_cartId_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_cartId_fkey"
      FOREIGN KEY ("cartId") REFERENCES "Cart"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
