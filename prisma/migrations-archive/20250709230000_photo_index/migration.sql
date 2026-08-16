-- CreateTable
CREATE TABLE "photo_index" (
    "id" TEXT NOT NULL,
    "ean" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "relative_path" TEXT NOT NULL,
    "app_properties" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photo_index_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "photo_index_file_id_key" ON "photo_index"("file_id");

-- CreateIndex
CREATE INDEX "photo_index_ean_idx" ON "photo_index"("ean");

-- CreateIndex
CREATE INDEX "photo_index_updated_at_idx" ON "photo_index"("updated_at" DESC);
