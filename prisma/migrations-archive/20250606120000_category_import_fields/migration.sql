-- AlterTable
ALTER TABLE "Category" ADD COLUMN "legacyId" INTEGER,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CategoryTranslation" ADD COLUMN "description" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Category_legacyId_key" ON "Category"("legacyId");
