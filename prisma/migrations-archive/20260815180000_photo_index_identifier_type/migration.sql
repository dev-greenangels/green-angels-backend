-- CreateEnum
CREATE TYPE "PhotoIdentifierType" AS ENUM ('EAN', 'SKU');

-- AlterTable
ALTER TABLE "photo_index" ADD COLUMN "identifier_type" "PhotoIdentifierType" NOT NULL DEFAULT 'EAN';

-- CreateIndex
CREATE INDEX "photo_index_identifier_type_ean_idx" ON "photo_index"("identifier_type", "ean");
