-- CreateEnum
CREATE TYPE "PackagingKind" AS ENUM ('POT', 'ROOT_BALL', 'BARE_ROOT', 'POT_ROOT_BALL');

-- AlterTable
ALTER TABLE "VariantAttributeValue" ADD COLUMN "packagingKind" "PackagingKind";
