-- CreateTable
CREATE TABLE "ProductAdditionalCategory" (
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ProductAdditionalCategory_pkey" PRIMARY KEY ("productId","categoryId")
);

-- CreateTable
CREATE TABLE "VariantAttribute" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legacyId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VariantAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantAttributeTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,

    CONSTRAINT "VariantAttributeTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantAttributeValue" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legacyId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "attributeId" TEXT NOT NULL,

    CONSTRAINT "VariantAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantAttributeValueTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,

    CONSTRAINT "VariantAttributeValueTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantAttributeValue" (
    "variantId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,

    CONSTRAINT "ProductVariantAttributeValue_pkey" PRIMARY KEY ("variantId","valueId")
);

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN "ean" TEXT,
ADD COLUMN "legacyId" TEXT,
ALTER COLUMN "attributes" SET DEFAULT '{}';

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttribute_slug_key" ON "VariantAttribute"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttributeTranslation_attributeId_locale_key" ON "VariantAttributeTranslation"("attributeId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttributeValue_attributeId_slug_key" ON "VariantAttributeValue"("attributeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttributeValueTranslation_valueId_locale_key" ON "VariantAttributeValueTranslation"("valueId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_ean_key" ON "ProductVariant"("ean");

-- AddForeignKey
ALTER TABLE "ProductAdditionalCategory" ADD CONSTRAINT "ProductAdditionalCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAdditionalCategory" ADD CONSTRAINT "ProductAdditionalCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeTranslation" ADD CONSTRAINT "VariantAttributeTranslation_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "VariantAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "VariantAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValueTranslation" ADD CONSTRAINT "VariantAttributeValueTranslation_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "VariantAttributeValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantAttributeValue" ADD CONSTRAINT "ProductVariantAttributeValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantAttributeValue" ADD CONSTRAINT "ProductVariantAttributeValue_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "VariantAttributeValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
