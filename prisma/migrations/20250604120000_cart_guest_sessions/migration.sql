-- AlterTable: guest / abandoned carts + createdAt
ALTER TABLE "Cart" ADD COLUMN "guestSessionId" TEXT;
ALTER TABLE "Cart" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Cart" ALTER COLUMN "userId" DROP NOT NULL;

CREATE UNIQUE INDEX "Cart_guestSessionId_key" ON "Cart"("guestSessionId");
CREATE INDEX "Cart_updatedAt_idx" ON "Cart"("updatedAt");

CREATE UNIQUE INDEX "CartItem_cartId_productVariantId_key" ON "CartItem"("cartId", "productVariantId");
