-- AlterTable
ALTER TABLE "Characteristic" ADD COLUMN "showOnProductPage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Characteristic" ADD COLUMN "icon" TEXT;

UPDATE "Characteristic" SET "showOnProductPage" = true, "icon" = 'Sun' WHERE slug = 'sun-requirement';
UPDATE "Characteristic" SET "showOnProductPage" = true, "icon" = 'ArrowUpDown' WHERE slug = 'height';
UPDATE "Characteristic" SET "showOnProductPage" = true, "icon" = 'Mountain' WHERE slug = 'soil-type';
UPDATE "Characteristic" SET "showOnProductPage" = true, "icon" = 'Thermometer' WHERE slug = 'hardiness-zone';
UPDATE "Characteristic" SET "showOnProductPage" = true, "icon" = 'Droplets' WHERE slug = 'watering-needs';
