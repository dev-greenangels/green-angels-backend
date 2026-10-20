-- Flexi Item Discount snapshot: base commercial unit + additive percent (slevaPol).
-- Legacy rows keep NULL → export uses payable commercialUnitPrice only.

ALTER TABLE "OrderItem" ADD COLUMN "commercialBaseUnitPrice" DECIMAL(16,6);
ALTER TABLE "OrderItem" ADD COLUMN "flexiSlevaPol" DECIMAL(6,2);
