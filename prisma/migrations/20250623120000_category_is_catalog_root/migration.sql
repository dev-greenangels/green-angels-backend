-- AlterTable
ALTER TABLE "Category" ADD COLUMN "isCatalogRoot" BOOLEAN NOT NULL DEFAULT false;

-- Позначити існуючий корінь каталогу (якщо є)
UPDATE "Category" SET "isCatalogRoot" = true WHERE slug = 'kataloh-tovariv';
