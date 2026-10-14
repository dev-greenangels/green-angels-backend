-- PlantStock: ABRA skladova-karta.rezervMJ (total reserved) on stock cache.
-- NULL = field not returned by ABRA; do not coerce to 0.

ALTER TABLE "plant_stock_stock_cache" ADD COLUMN IF NOT EXISTS "reserved_qty" DECIMAL(14,4);
