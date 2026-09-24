-- Packeta service identity snapshot on Order (nullable; no backfill).
ALTER TABLE "Order" ADD COLUMN "packetaServiceKey" TEXT;
ALTER TABLE "Order" ADD COLUMN "packetaCarrierId" TEXT;
ALTER TABLE "Order" ADD COLUMN "packetaPickupPointKind" TEXT;
