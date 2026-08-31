-- DropIndex
DROP INDEX "CategoryTranslation_name_trgm_idx";

-- DropIndex
DROP INDEX "Product_latinName_trgm_idx";

-- DropIndex
DROP INDEX "Product_slug_trgm_idx";

-- DropIndex
DROP INDEX "ProductTranslation_name_trgm_idx";

-- AlterTable
ALTER TABLE "DiscountRule" ALTER COLUMN "updatedAt" DROP DEFAULT;
