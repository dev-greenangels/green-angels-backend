-- PlantStock SK: ABRA cenik/sklad cache + operation journal (no shop catalog changes)

CREATE TYPE "PlantStockOperationKind" AS ENUM ('RESERVATION_SYNC', 'INVENTORY_CREATE', 'INVENTORY_POST');
CREATE TYPE "PlantStockOperationStatus" AS ENUM ('IDLE', 'PENDING', 'CREATED_NOT_POSTED', 'POSTED', 'SYNCED', 'NOOP', 'CONFLICT', 'FAILED');

CREATE TABLE "plant_stock_cenik_cache" (
    "id" TEXT NOT NULL,
    "flexiId" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "nazev" TEXT NOT NULL,
    "inactive" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plant_stock_cenik_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plant_stock_cenik_cache_kod_key" ON "plant_stock_cenik_cache"("kod");
CREATE INDEX "plant_stock_cenik_cache_nazev_idx" ON "plant_stock_cenik_cache"("nazev");
CREATE INDEX "plant_stock_cenik_cache_inactive_kod_idx" ON "plant_stock_cenik_cache"("inactive", "kod");

CREATE TABLE "plant_stock_sklad_cache" (
    "id" TEXT NOT NULL,
    "flexiId" TEXT NOT NULL,
    "kod" TEXT NOT NULL,
    "nazev" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plant_stock_sklad_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plant_stock_sklad_cache_kod_key" ON "plant_stock_sklad_cache"("kod");

CREATE TABLE "plant_stock_operation" (
    "id" TEXT NOT NULL,
    "kind" "PlantStockOperationKind" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PlantStockOperationStatus" NOT NULL DEFAULT 'IDLE',
    "localDocRef" TEXT,
    "sku" TEXT,
    "skladKod" TEXT,
    "abraId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "plant_stock_operation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plant_stock_operation_idempotencyKey_key" ON "plant_stock_operation"("idempotencyKey");
CREATE INDEX "plant_stock_operation_kind_status_idx" ON "plant_stock_operation"("kind", "status");
CREATE INDEX "plant_stock_operation_localDocRef_idx" ON "plant_stock_operation"("localDocRef");
CREATE INDEX "plant_stock_operation_sku_skladKod_idx" ON "plant_stock_operation"("sku", "skladKod");
