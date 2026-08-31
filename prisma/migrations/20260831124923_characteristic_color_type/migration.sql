-- AlterEnum
ALTER TYPE "CharacteristicValueType" ADD VALUE 'COLOR';

-- AlterTable
ALTER TABLE "CharacteristicOption" ADD COLUMN "colorHex" TEXT;
