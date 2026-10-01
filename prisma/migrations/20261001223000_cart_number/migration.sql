-- Human-readable cart number (backoffice). SERIAL backfills existing rows.
ALTER TABLE "Cart" ADD COLUMN "cartNumber" SERIAL NOT NULL;
CREATE UNIQUE INDEX "Cart_cartNumber_key" ON "Cart"("cartNumber");
