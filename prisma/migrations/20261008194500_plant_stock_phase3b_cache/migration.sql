-- PlantStock Phase 3B: strom leaf grouping + warehouse stock snapshot cache

ALTER TABLE "plant_stock_cenik_cache" ADD COLUMN IF NOT EXISTS "strom_leaf_id" TEXT;
ALTER TABLE "plant_stock_cenik_cache" ADD COLUMN IF NOT EXISTS "plant_nazev" TEXT;
ALTER TABLE "plant_stock_cenik_cache" ADD COLUMN IF NOT EXISTS "size_label" TEXT;

CREATE INDEX IF NOT EXISTS "plant_stock_cenik_cache_plant_nazev_idx" ON "plant_stock_cenik_cache"("plant_nazev");
CREATE INDEX IF NOT EXISTS "plant_stock_cenik_cache_strom_leaf_id_idx" ON "plant_stock_cenik_cache"("strom_leaf_id");

CREATE TABLE IF NOT EXISTS "plant_stock_stock_cache" (
    "id" TEXT NOT NULL,
    "warehouse_code" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "stav_mj" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "dostup_mj" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plant_stock_stock_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "plant_stock_stock_cache_warehouse_code_sku_key"
  ON "plant_stock_stock_cache"("warehouse_code", "sku");
CREATE INDEX IF NOT EXISTS "plant_stock_stock_cache_warehouse_code_idx"
  ON "plant_stock_stock_cache"("warehouse_code");
CREATE INDEX IF NOT EXISTS "plant_stock_stock_cache_sku_idx"
  ON "plant_stock_stock_cache"("sku");
