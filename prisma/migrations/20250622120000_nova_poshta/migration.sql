-- CreateTable
CREATE TABLE "NpSettlement" (
    "ref" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionRu" TEXT,
    "settlementType" TEXT,
    "areaDescription" TEXT,
    "regionsDescription" TEXT,
    "latitude" TEXT,
    "longitude" TEXT,
    "hasWarehouse" BOOLEAN NOT NULL DEFAULT true,
    "searchText" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpSettlement_pkey" PRIMARY KEY ("ref")
);

-- CreateTable
CREATE TABLE "NpWarehouseType" (
    "ref" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionRu" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpWarehouseType_pkey" PRIMARY KEY ("ref")
);

-- CreateTable
CREATE TABLE "NpWarehouse" (
    "ref" TEXT NOT NULL,
    "settlementRef" TEXT NOT NULL,
    "typeOfWarehouseRef" TEXT,
    "description" TEXT NOT NULL,
    "shortAddress" TEXT,
    "number" TEXT,
    "cityDescription" TEXT,
    "warehouseStatus" TEXT,
    "denyToSelect" BOOLEAN NOT NULL DEFAULT false,
    "searchText" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpWarehouse_pkey" PRIMARY KEY ("ref")
);

-- CreateTable
CREATE TABLE "NpSyncRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recordsTotal" INTEGER,
    "recordsSynced" INTEGER NOT NULL DEFAULT 0,
    "currentPage" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "jobId" TEXT,

    CONSTRAINT "NpSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NpSettlement_searchText_idx" ON "NpSettlement"("searchText");

-- CreateIndex
CREATE INDEX "NpWarehouse_settlementRef_idx" ON "NpWarehouse"("settlementRef");

-- CreateIndex
CREATE INDEX "NpWarehouse_settlementRef_searchText_idx" ON "NpWarehouse"("settlementRef", "searchText");

-- CreateIndex
CREATE UNIQUE INDEX "NpSyncRun_jobId_key" ON "NpSyncRun"("jobId");

-- CreateIndex
CREATE INDEX "NpSyncRun_status_startedAt_idx" ON "NpSyncRun"("status", "startedAt" DESC);

-- AddForeignKey
ALTER TABLE "NpWarehouse" ADD CONSTRAINT "NpWarehouse_settlementRef_fkey" FOREIGN KEY ("settlementRef") REFERENCES "NpSettlement"("ref") ON DELETE CASCADE ON UPDATE CASCADE;
