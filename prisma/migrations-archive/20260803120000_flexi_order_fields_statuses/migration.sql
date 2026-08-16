-- Order B2B + ERP id
ALTER TABLE "Order" ADD COLUMN "companyLegalName" TEXT;
ALTER TABLE "Order" ADD COLUMN "companyIco" TEXT;
ALTER TABLE "Order" ADD COLUMN "companyDic" TEXT;
ALTER TABLE "Order" ADD COLUMN "companyVatId" TEXT;
ALTER TABLE "Order" ADD COLUMN "externalErpId" TEXT;

CREATE INDEX "Order_externalErpId_idx" ON "Order"("externalErpId");
CREATE INDEX "Order_companyIco_idx" ON "Order"("companyIco");

-- Warehouse fulfillment system statuses
INSERT INTO "OrderStatusDefinition" ("id", "code", "nameUk", "nameEn", "nameSk", "color", "sortOrder", "isActive", "isSystem", "isTerminal", "externalCode", "updatedAt") VALUES
  ('10000000-0000-4000-8000-000000000007', 'AWAITING_STOCK', 'Очікує товар', 'Awaiting stock', 'Čaká na tovar', 'orange', 25, true, true, false, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000008', 'PICKING', 'На зборі', 'Picking', 'Na zbere', 'blue', 32, true, true, false, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000009', 'PACKED', 'Спаковано', 'Packed', 'Zabalené', 'blue', 35, true, true, false, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
