-- Green Angels baseline (00000000000000_baseline)
-- Source: prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma
-- plus PostgreSQL objects Prisma cannot express, plus curated reference INSERTs
-- from historical migrations (deterministic UUIDs). Not a dump of the live catalog.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('GUEST', 'USER', 'WHOLESALER', 'ADMIN', 'MANAGER');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'PHONE');

-- CreateEnum
CREATE TYPE "PhotoIdentifierType" AS ENUM ('EAN', 'SKU');

-- CreateEnum
CREATE TYPE "CharacteristicValueType" AS ENUM ('SELECT', 'MULTI_SELECT', 'NUMBER', 'TEXT');

-- CreateEnum
CREATE TYPE "VariantAttributeType" AS ENUM ('UNIVERSAL', 'CONTAINER', 'RANGE', 'COLOR', 'NUMBER');

-- CreateEnum
CREATE TYPE "PackagingKind" AS ENUM ('POT', 'ROOT_BALL', 'BARE_ROOT', 'POT_ROOT_BALL');

-- CreateEnum
CREATE TYPE "VariantQuantityDiscountType" AS ENUM ('FIXED_PRICE', 'PERCENT');

-- CreateEnum
CREATE TYPE "UnitOfMeasureType" AS ENUM ('COUNT', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA');

-- CreateEnum
CREATE TYPE "DiscountTarget" AS ENUM ('ALL_PRODUCTS', 'CATEGORY', 'PRODUCT', 'VARIANT');

-- CreateEnum
CREATE TYPE "DiscountValueType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "DiscountApplicationScope" AS ENUM ('LINE_ITEMS', 'CART_TOTAL');

-- CreateEnum
CREATE TYPE "PromoStackingMode" AS ENUM ('NONE', 'ALL', 'ALLOWLIST', 'DENYLIST');

-- CreateEnum
CREATE TYPE "PromoDiscountCombinationMode" AS ENUM ('STACK', 'BEST_PRICE');

-- CreateEnum
CREATE TYPE "DiscountRuleCombinationMode" AS ENUM ('BEST_PRICE', 'STACK', 'MAX_OF');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "patronymic" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "deliveryDefaults" JSONB,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "legacyId" TEXT,
    "legacySource" TEXT,
    "newsletter" BOOLEAN NOT NULL DEFAULT false,
    "optin" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorProfile" (
    "id" TEXT NOT NULL,
    "externalId1C" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountRate" INTEGER NOT NULL DEFAULT 0,
    "priceType" TEXT NOT NULL DEFAULT 'роздріб',
    "userId" TEXT NOT NULL,

    CONSTRAINT "ContractorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "image" TEXT,
    "latinName" TEXT,
    "legacyId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCatalogRoot" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "footerDescription" TEXT,
    "metaTitle" TEXT,
    "metaDesc" TEXT,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "CategoryTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "latinName" TEXT,
    "cnCode" TEXT,
    "legacyId" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "restockedAt" TIMESTAMP(3),
    "fullyOutOfStockAt" TIMESTAMP(3),
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStockNotification" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductStockNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAdditionalCategory" (
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ProductAdditionalCategory_pkey" PRIMARY KEY ("productId","categoryId")
);

-- CreateTable
CREATE TABLE "ProductTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "metaTitle" TEXT,
    "metaDesc" TEXT,
    "productId" TEXT NOT NULL,

    CONSTRAINT "ProductTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Characteristic" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legacyId" TEXT,
    "valueType" "CharacteristicValueType" NOT NULL,
    "unit" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isFilterable" BOOLEAN NOT NULL DEFAULT true,
    "showOnProductPage" BOOLEAN NOT NULL DEFAULT false,
    "icon" TEXT,

    CONSTRAINT "Characteristic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacteristicTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "characteristicId" TEXT NOT NULL,

    CONSTRAINT "CharacteristicTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacteristicOption" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legacyId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "characteristicId" TEXT NOT NULL,

    CONSTRAINT "CharacteristicOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacteristicOptionTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "CharacteristicOptionTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCharacteristic" (
    "id" TEXT NOT NULL,
    "numberValue" DOUBLE PRECISION,
    "textValue" TEXT,
    "productId" TEXT NOT NULL,
    "characteristicId" TEXT NOT NULL,
    "optionId" TEXT,

    CONSTRAINT "ProductCharacteristic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantAttribute" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legacyId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "valueType" "VariantAttributeType" NOT NULL DEFAULT 'UNIVERSAL',
    "unit" TEXT,
    "isFilterable" BOOLEAN NOT NULL DEFAULT true,
    "participatesInLabel" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VariantAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantAttributeTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "attributeId" TEXT NOT NULL,

    CONSTRAINT "VariantAttributeTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantAttributeValue" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legacyId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "numericMin" DECIMAL(12,3),
    "numericMax" DECIMAL(12,3),
    "volumeLiters" DECIMAL(12,3),
    "potDiameterCm" DECIMAL(12,3),
    "potHeightCm" DECIMAL(12,3),
    "tareWeightKg" DECIMAL(12,3),
    "packagingKind" "PackagingKind",
    "colorHex" TEXT,
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
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "sku" TEXT,
    "ean" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION,
    "lengthCm" DOUBLE PRECISION,
    "widthCm" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "volumetricWeightKg" DOUBLE PRECISION,
    "legacyId" TEXT,
    "availableFrom" TIMESTAMP(3),
    "productId" TEXT NOT NULL,
    "salesUnitId" TEXT,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantQuantityPrice" (
    "id" TEXT NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "discountType" "VariantQuantityDiscountType" NOT NULL DEFAULT 'FIXED_PRICE',
    "value" DECIMAL(10,2) NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "productVariantId" TEXT NOT NULL,

    CONSTRAINT "ProductVariantQuantityPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantAttributeValue" (
    "variantId" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,

    CONSTRAINT "ProductVariantAttributeValue_pkey" PRIMARY KEY ("variantId","valueId")
);

-- CreateTable
CREATE TABLE "ProductPrice" (
    "id" TEXT NOT NULL,
    "priceType" TEXT NOT NULL DEFAULT 'роздріб',
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "value" DECIMAL(10,2) NOT NULL,
    "compareAtValue" DECIMAL(10,2),
    "productVariantId" TEXT NOT NULL,

    CONSTRAINT "ProductPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productVariantId" TEXT NOT NULL,
    "priceType" TEXT NOT NULL DEFAULT 'роздріб',
    "currency" TEXT NOT NULL DEFAULT 'UAH',

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Currency" (
    "code" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "isoNumericCode" INTEGER,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CurrencyTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,

    CONSTRAINT "CurrencyTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "type" "UnitOfMeasureType" NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitOfMeasureTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "UnitOfMeasureTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "legacyId" TEXT,
    "productId" TEXT NOT NULL,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCustomerGroup" (
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "UserCustomerGroup_pkey" PRIMARY KEY ("userId","groupId")
);

-- CreateTable
CREATE TABLE "DiscountRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DiscountValueType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "target" "DiscountTarget" NOT NULL,
    "targetId" TEXT,
    "targetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeVariantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onlyForRoles" "Role"[],
    "combinesWithOtherDiscounts" "DiscountRuleCombinationMode" NOT NULL DEFAULT 'BEST_PRICE',
    "minCartSubtotal" DECIMAL(10,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscountRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRuleGroup" (
    "discountRuleId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "DiscountRuleGroup_pkey" PRIMARY KEY ("discountRuleId","groupId")
);

-- CreateTable
CREATE TABLE "DiscountRuleUser" (
    "discountRuleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DiscountRuleUser_pkey" PRIMARY KEY ("discountRuleId","userId")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "DiscountValueType",
    "value" DECIMAL(10,2),
    "discountApplicationScope" "DiscountApplicationScope" NOT NULL DEFAULT 'LINE_ITEMS',
    "combinesWithOtherDiscounts" "PromoDiscountCombinationMode" NOT NULL DEFAULT 'BEST_PRICE',
    "stackingMode" "PromoStackingMode" NOT NULL DEFAULT 'NONE',
    "compatiblePromoCodeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target" "DiscountTarget" NOT NULL,
    "targetId" TEXT,
    "targetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeVariantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minCartSubtotal" DECIMAL(10,2),
    "giftVariantId" TEXT,
    "giftQuantity" INTEGER NOT NULL DEFAULT 1,
    "usageLimitTotal" INTEGER,
    "usageLimitPerUser" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCodeUser" (
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "PromoCodeUser_pkey" PRIMARY KEY ("promoCodeId","userId")
);

-- CreateTable
CREATE TABLE "PromoCodeGroup" (
    "promoCodeId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "PromoCodeGroup_pkey" PRIMARY KEY ("promoCodeId","groupId")
);

-- CreateTable
CREATE TABLE "PromoCodeUsage" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guestSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "cartId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameUk" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameSk" TEXT,
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "externalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderStatusDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationReason" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameUk" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameSk" TEXT,
    "allowAdmin" BOOLEAN NOT NULL DEFAULT true,
    "allowUser" BOOLEAN NOT NULL DEFAULT false,
    "allowSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancellationReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" SERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "productsSubtotal" DECIMAL(10,2),
    "deliveryAmount" DECIMAL(10,2),
    "packagingAmount" DECIMAL(10,2),
    "packagingBoxCount" INTEGER,
    "packagingPalletCount" INTEGER,
    "taxAmount" DECIMAL(10,2),
    "taxRatePercent" DOUBLE PRECISION,
    "taxCountryCode" TEXT,
    "taxRegime" TEXT,
    "fxRateUsed" DOUBLE PRECISION,
    "buyerType" TEXT,
    "codFeeAmount" DECIMAL(10,2),
    "pointsDiscountAmount" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "customerFirstName" TEXT NOT NULL,
    "customerLastName" TEXT NOT NULL,
    "customerPatronymic" TEXT,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "receiverFirstName" TEXT NOT NULL,
    "receiverLastName" TEXT NOT NULL,
    "receiverPatronymic" TEXT,
    "receiverPhone" TEXT NOT NULL,
    "deliveryMethod" TEXT NOT NULL DEFAULT 'nova-poshta-branch',
    "deliveryCity" TEXT,
    "deliveryBranch" TEXT,
    "deliveryStreet" TEXT,
    "deliveryHouseNumber" TEXT,
    "deliveryPostalCode" TEXT,
    "deliveryCountryCode" TEXT,
    "receiverCompanyName" TEXT,
    "deliveryBranchLabel" TEXT,
    "paymentMethod" TEXT NOT NULL,
    "comment" TEXT,
    "companyLegalName" TEXT,
    "companyIco" TEXT,
    "companyDic" TEXT,
    "companyVatId" TEXT,
    "companyStreet" TEXT,
    "companyCity" TEXT,
    "companyPostalCode" TEXT,
    "preferredShipDate" TIMESTAMP(3),
    "monopayInvoiceId" TEXT,
    "stripePaymentId" TEXT,
    "paymentProvider" TEXT,
    "paymentStatus" TEXT,
    "monopayModifiedAt" TIMESTAMP(3),
    "privacyConsentAt" TIMESTAMP(3),
    "privacyConsentVersion" TEXT,
    "createAccountRequested" BOOLEAN NOT NULL DEFAULT false,
    "trackingNumber" TEXT,
    "trackingCarrier" TEXT,
    "npDocumentRef" TEXT,
    "trackingSyncedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "cancellationReasonId" TEXT,
    "cancellationSource" TEXT,
    "cancellationNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "externalErpId" TEXT,
    "externalId1C" TEXT,
    "erpSyncStatus" TEXT,
    "erpNativeId" TEXT,
    "erpNativeKod" TEXT,
    "erpSyncAttempts" INTEGER NOT NULL DEFAULT 0,
    "erpLastErrorCode" TEXT,
    "erpLastErrorMessage" TEXT,
    "erpLastSyncAt" TIMESTAMP(3),
    "erpSyncedAt" TIMESTAMP(3),
    "legacyId" TEXT,
    "legacySource" TEXT,
    "legacyReference" TEXT,
    "userId" TEXT,
    "promoCodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPromoCode" (
    "orderId" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,

    CONSTRAINT "OrderPromoCode_pkey" PRIMARY KEY ("orderId","promoCodeId")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "priceAtPurchase" DECIMAL(10,2) NOT NULL,
    "productName" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "variantLabel" TEXT,
    "sku" TEXT,
    "orderId" TEXT NOT NULL,
    "productVariantId" TEXT,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redirect" (
    "id" TEXT NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 301,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "prefix" TEXT,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Redirect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_index" (
    "id" TEXT NOT NULL,
    "identifier_type" "PhotoIdentifierType" NOT NULL DEFAULT 'EAN',
    "ean" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "relative_path" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL DEFAULT 0,
    "app_properties" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photo_index_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NpSettlement" (
    "ref" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionRu" TEXT,
    "descriptionTranslit" TEXT,
    "settlementType" TEXT,
    "areaDescription" TEXT,
    "regionsDescription" TEXT,
    "latitude" TEXT,
    "longitude" TEXT,
    "hasWarehouse" BOOLEAN NOT NULL DEFAULT true,
    "searchText" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpSettlement_pkey" PRIMARY KEY ("ref")
);

-- CreateTable
CREATE TABLE "NpWarehouseType" (
    "ref" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionRu" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpWarehouseType_pkey" PRIMARY KEY ("ref")
);

-- CreateTable
CREATE TABLE "NpWarehouse" (
    "ref" TEXT NOT NULL,
    "settlementRef" TEXT NOT NULL,
    "typeOfWarehouseRef" TEXT,
    "description" TEXT NOT NULL,
    "shortAddress" TEXT,
    "number" TEXT,
    "cityDescription" TEXT,
    "warehouseStatus" TEXT,
    "denyToSelect" BOOLEAN NOT NULL DEFAULT false,
    "searchText" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpWarehouse_pkey" PRIMARY KEY ("ref")
);

-- CreateTable
CREATE TABLE "NpSyncRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recordsTotal" INTEGER,
    "recordsSynced" INTEGER NOT NULL DEFAULT 0,
    "currentPage" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "jobId" TEXT,

    CONSTRAINT "NpSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" TEXT,
    "image" TEXT,
    "author" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "legacyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "productId" TEXT,
    "authorName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "text" TEXT NOT NULL,
    "image" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" INTEGER NOT NULL DEFAULT 5,
    "storeReplyText" TEXT,
    "storeReplyAuthorName" TEXT,
    "storeReplyAt" TIMESTAMP(3),
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "legacyId" TEXT,
    "legacySource" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralProgram" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "refereeDiscountType" "DiscountValueType" NOT NULL DEFAULT 'PERCENT',
    "refereeDiscountValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "referrerPoints" INTEGER NOT NULL DEFAULT 0,
    "minOrderSubtotal" DECIMAL(10,2),
    "maxRefereeDiscount" DECIMAL(10,2),
    "excludeProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludeCategoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onlyForRoles" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "cookieDays" INTEGER NOT NULL DEFAULT 30,
    "pointsExpireDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralProgramGroup" (
    "programId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "ReferralProgramGroup_pkey" PRIMARY KEY ("programId","groupId")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralAttribution" (
    "id" TEXT NOT NULL,
    "referralCodeId" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "refereeUserId" TEXT,
    "orderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardedAt" TIMESTAMP(3),

    CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VatCountryRate" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "rateType" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "cnPrefixes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'seed',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VatCountryRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlexiChangeEvent" (
    "id" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "operation" TEXT NOT NULL DEFAULT '',
    "changeVersion" INTEGER NOT NULL DEFAULT 0,
    "inVersion" INTEGER,
    "rowGlobalVersion" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlexiChangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_legacyId_idx" ON "User"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_legacySource_legacyId_key" ON "User"("legacySource", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerId_key" ON "Account"("provider", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorProfile_externalId1C_key" ON "ContractorProfile"("externalId1C");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_legacyId_key" ON "Category"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryTranslation_categoryId_locale_key" ON "CategoryTranslation"("categoryId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_legacyId_key" ON "Product"("legacyId");

-- CreateIndex
CREATE INDEX "Product_cnCode_idx" ON "Product"("cnCode");

-- CreateIndex
CREATE INDEX "ProductStockNotification_productId_idx" ON "ProductStockNotification"("productId");

-- CreateIndex
CREATE INDEX "ProductStockNotification_productId_email_idx" ON "ProductStockNotification"("productId", "email");

-- CreateIndex
CREATE INDEX "ProductStockNotification_productId_phone_idx" ON "ProductStockNotification"("productId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTranslation_productId_locale_key" ON "ProductTranslation"("productId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Characteristic_slug_key" ON "Characteristic"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Characteristic_legacyId_key" ON "Characteristic"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacteristicTranslation_characteristicId_locale_key" ON "CharacteristicTranslation"("characteristicId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "CharacteristicOption_legacyId_key" ON "CharacteristicOption"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacteristicOption_characteristicId_slug_key" ON "CharacteristicOption"("characteristicId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "CharacteristicOptionTranslation_optionId_locale_key" ON "CharacteristicOptionTranslation"("optionId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCharacteristic_productId_characteristicId_optionId_key" ON "ProductCharacteristic"("productId", "characteristicId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttribute_slug_key" ON "VariantAttribute"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttribute_legacyId_key" ON "VariantAttribute"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttributeTranslation_attributeId_locale_key" ON "VariantAttributeTranslation"("attributeId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttributeValue_legacyId_key" ON "VariantAttributeValue"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttributeValue_attributeId_slug_key" ON "VariantAttributeValue"("attributeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttributeValueTranslation_valueId_locale_key" ON "VariantAttributeValueTranslation"("valueId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_ean_key" ON "ProductVariant"("ean");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_legacyId_key" ON "ProductVariant"("legacyId");

-- CreateIndex
CREATE INDEX "ProductVariantQuantityPrice_productVariantId_idx" ON "ProductVariantQuantityPrice"("productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPrice_productVariantId_priceType_currency_key" ON "ProductPrice"("productVariantId", "priceType", "currency");

-- CreateIndex
CREATE INDEX "PriceHistory_productVariantId_priceType_currency_recordedAt_idx" ON "PriceHistory"("productVariantId", "priceType", "currency", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyTranslation_currencyCode_locale_key" ON "CurrencyTranslation"("currencyCode", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_code_key" ON "UnitOfMeasure"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasureTranslation_unitId_locale_key" ON "UnitOfMeasureTranslation"("unitId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_legacyId_key" ON "ProductImage"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerGroup_slug_key" ON "CustomerGroup"("slug");

-- CreateIndex
CREATE INDEX "UserCustomerGroup_groupId_idx" ON "UserCustomerGroup"("groupId");

-- CreateIndex
CREATE INDEX "DiscountRuleUser_userId_idx" ON "DiscountRuleUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCodeUser_userId_idx" ON "PromoCodeUser"("userId");

-- CreateIndex
CREATE INDEX "PromoCodeUsage_promoCodeId_userId_idx" ON "PromoCodeUsage"("promoCodeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCodeUsage_orderId_promoCodeId_key" ON "PromoCodeUsage"("orderId", "promoCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_guestSessionId_key" ON "Cart"("guestSessionId");

-- CreateIndex
CREATE INDEX "Cart_updatedAt_idx" ON "Cart"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_productVariantId_key" ON "CartItem"("cartId", "productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderStatusDefinition_code_key" ON "OrderStatusDefinition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationReason_code_key" ON "CancellationReason"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_monopayInvoiceId_key" ON "Order"("monopayInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripePaymentId_key" ON "Order"("stripePaymentId");

-- CreateIndex
CREATE INDEX "Order_trackingNumber_idx" ON "Order"("trackingNumber");

-- CreateIndex
CREATE INDEX "Order_cancellationReasonId_idx" ON "Order"("cancellationReasonId");

-- CreateIndex
CREATE INDEX "Order_legacyId_idx" ON "Order"("legacyId");

-- CreateIndex
CREATE INDEX "Order_externalErpId_idx" ON "Order"("externalErpId");

-- CreateIndex
CREATE INDEX "Order_erpSyncStatus_idx" ON "Order"("erpSyncStatus");

-- CreateIndex
CREATE INDEX "Order_erpNativeKod_idx" ON "Order"("erpNativeKod");

-- CreateIndex
CREATE INDEX "Order_companyIco_idx" ON "Order"("companyIco");

-- CreateIndex
CREATE INDEX "Order_preferredShipDate_idx" ON "Order"("preferredShipDate");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_legacySource_legacyId_key" ON "Order"("legacySource", "legacyId");

-- CreateIndex
CREATE INDEX "OrderPromoCode_promoCodeId_idx" ON "OrderPromoCode"("promoCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_key_key" ON "Settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Redirect_fromPath_key" ON "Redirect"("fromPath");

-- CreateIndex
CREATE INDEX "Redirect_prefix_idx" ON "Redirect"("prefix");

-- CreateIndex
CREATE INDEX "Redirect_isActive_idx" ON "Redirect"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "photo_index_file_id_key" ON "photo_index"("file_id");

-- CreateIndex
CREATE INDEX "photo_index_ean_idx" ON "photo_index"("ean");

-- CreateIndex
CREATE INDEX "photo_index_identifier_type_ean_idx" ON "photo_index"("identifier_type", "ean");

-- CreateIndex
CREATE INDEX "photo_index_updated_at_idx" ON "photo_index"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "NpSettlement_searchText_idx" ON "NpSettlement"("searchText");

-- CreateIndex
CREATE INDEX "NpWarehouse_settlementRef_idx" ON "NpWarehouse"("settlementRef");

-- CreateIndex
CREATE INDEX "NpWarehouse_settlementRef_searchText_idx" ON "NpWarehouse"("settlementRef", "searchText");

-- CreateIndex
CREATE UNIQUE INDEX "NpSyncRun_jobId_key" ON "NpSyncRun"("jobId");

-- CreateIndex
CREATE INDEX "NpSyncRun_status_startedAt_idx" ON "NpSyncRun"("status", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_legacyId_key" ON "BlogPost"("legacyId");

-- CreateIndex
CREATE INDEX "BlogPost_isPublished_createdAt_idx" ON "BlogPost"("isPublished", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Review_status_createdAt_idx" ON "Review"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Review_productId_status_createdAt_idx" ON "Review"("productId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Review_userId_createdAt_idx" ON "Review"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Review_rating_idx" ON "Review"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "Review_legacySource_legacyId_key" ON "Review"("legacySource", "legacyId");

-- CreateIndex
CREATE INDEX "UserFavorite_userId_createdAt_idx" ON "UserFavorite"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserFavorite_userId_productId_key" ON "UserFavorite"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_userId_key" ON "ReferralCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralAttribution_orderId_key" ON "ReferralAttribution"("orderId");

-- CreateIndex
CREATE INDEX "ReferralAttribution_referrerUserId_createdAt_idx" ON "ReferralAttribution"("referrerUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ReferralAttribution_referralCodeId_idx" ON "ReferralAttribution"("referralCodeId");

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_userId_createdAt_idx" ON "PointsLedgerEntry"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_orderId_idx" ON "PointsLedgerEntry"("orderId");

-- CreateIndex
CREATE INDEX "VatCountryRate_countryCode_rateType_idx" ON "VatCountryRate"("countryCode", "rateType");

-- CreateIndex
CREATE UNIQUE INDEX "VatCountryRate_countryCode_rateType_percent_key" ON "VatCountryRate"("countryCode", "rateType", "percent");

-- CreateIndex
CREATE INDEX "FlexiChangeEvent_status_changeVersion_idx" ON "FlexiChangeEvent"("status", "changeVersion");

-- CreateIndex
CREATE INDEX "FlexiChangeEvent_status_evidence_objectId_idx" ON "FlexiChangeEvent"("status", "evidence", "objectId");

-- CreateIndex
CREATE INDEX "FlexiChangeEvent_changeVersion_idx" ON "FlexiChangeEvent"("changeVersion");

-- CreateIndex
CREATE UNIQUE INDEX "FlexiChangeEvent_evidence_objectId_changeVersion_key" ON "FlexiChangeEvent"("evidence", "objectId", "changeVersion");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_createdAt_idx" ON "StripeWebhookEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorProfile" ADD CONSTRAINT "ContractorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryTranslation" ADD CONSTRAINT "CategoryTranslation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStockNotification" ADD CONSTRAINT "ProductStockNotification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAdditionalCategory" ADD CONSTRAINT "ProductAdditionalCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAdditionalCategory" ADD CONSTRAINT "ProductAdditionalCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTranslation" ADD CONSTRAINT "ProductTranslation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacteristicTranslation" ADD CONSTRAINT "CharacteristicTranslation_characteristicId_fkey" FOREIGN KEY ("characteristicId") REFERENCES "Characteristic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacteristicOption" ADD CONSTRAINT "CharacteristicOption_characteristicId_fkey" FOREIGN KEY ("characteristicId") REFERENCES "Characteristic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacteristicOptionTranslation" ADD CONSTRAINT "CharacteristicOptionTranslation_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CharacteristicOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCharacteristic" ADD CONSTRAINT "ProductCharacteristic_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCharacteristic" ADD CONSTRAINT "ProductCharacteristic_characteristicId_fkey" FOREIGN KEY ("characteristicId") REFERENCES "Characteristic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCharacteristic" ADD CONSTRAINT "ProductCharacteristic_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CharacteristicOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeTranslation" ADD CONSTRAINT "VariantAttributeTranslation_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "VariantAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "VariantAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValueTranslation" ADD CONSTRAINT "VariantAttributeValueTranslation_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "VariantAttributeValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_salesUnitId_fkey" FOREIGN KEY ("salesUnitId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantQuantityPrice" ADD CONSTRAINT "ProductVariantQuantityPrice_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantAttributeValue" ADD CONSTRAINT "ProductVariantAttributeValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantAttributeValue" ADD CONSTRAINT "ProductVariantAttributeValue_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "VariantAttributeValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyTranslation" ADD CONSTRAINT "CurrencyTranslation_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "Currency"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitOfMeasureTranslation" ADD CONSTRAINT "UnitOfMeasureTranslation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomerGroup" ADD CONSTRAINT "UserCustomerGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCustomerGroup" ADD CONSTRAINT "UserCustomerGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRuleGroup" ADD CONSTRAINT "DiscountRuleGroup_discountRuleId_fkey" FOREIGN KEY ("discountRuleId") REFERENCES "DiscountRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRuleGroup" ADD CONSTRAINT "DiscountRuleGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRuleUser" ADD CONSTRAINT "DiscountRuleUser_discountRuleId_fkey" FOREIGN KEY ("discountRuleId") REFERENCES "DiscountRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRuleUser" ADD CONSTRAINT "DiscountRuleUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUser" ADD CONSTRAINT "PromoCodeUser_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUser" ADD CONSTRAINT "PromoCodeUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeGroup" ADD CONSTRAINT "PromoCodeGroup_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeGroup" ADD CONSTRAINT "PromoCodeGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancellationReasonId_fkey" FOREIGN KEY ("cancellationReasonId") REFERENCES "CancellationReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPromoCode" ADD CONSTRAINT "OrderPromoCode_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPromoCode" ADD CONSTRAINT "OrderPromoCode_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NpWarehouse" ADD CONSTRAINT "NpWarehouse_settlementRef_fkey" FOREIGN KEY ("settlementRef") REFERENCES "NpSettlement"("ref") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralProgramGroup" ADD CONSTRAINT "ReferralProgramGroup_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ReferralProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralProgramGroup" ADD CONSTRAINT "ReferralProgramGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CustomerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_refereeUserId_fkey" FOREIGN KEY ("refereeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedgerEntry" ADD CONSTRAINT "PointsLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedgerEntry" ADD CONSTRAINT "PointsLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DiscountRule.updatedAt DB default (live DB; Prisma @updatedAt does not emit it)
ALTER TABLE "DiscountRule" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Search: pg_trgm GIN indexes (historical 20250622120000_pg_trgm_search)
CREATE INDEX "Product_latinName_trgm_idx" ON "Product" USING gin ("latinName" gin_trgm_ops);
CREATE INDEX "Product_slug_trgm_idx" ON "Product" USING gin (slug gin_trgm_ops);
CREATE INDEX "ProductTranslation_name_trgm_idx" ON "ProductTranslation" USING gin (name gin_trgm_ops);
CREATE INDEX "CategoryTranslation_name_trgm_idx" ON "CategoryTranslation" USING gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Reference / seed data (historical migrations; deterministic UUIDs)
-- ---------------------------------------------------------------------------

-- Admin bootstrap (historical 20250614120000_seed_admin_user).
-- Password hash is the long-standing local bootstrap hash already in git.
-- Rotate this password after first production login.
INSERT INTO "User" (
  "id",
  "email",
  "firstName",
  "lastName",
  "passwordHash",
  "role",
  "emailVerified",
  "phoneVerified",
  "createdAt",
  "updatedAt"
)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'dev.green.angels@gmail.com',
  'Артур',
  'Деміч',
  '$2b$10$VtHLRn5ThORvJcp87lLwMu4q9OVUGPWJ.yI1nKgNDDnSqigZiXWXa',
  'ADMIN',
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO NOTHING;

INSERT INTO "Settings" ("id", "key", "value")
VALUES
  (
    'b0000000-0000-4000-8000-000000000001',
    'store.contact',
    '{"addressLine1":"Київська обл., м. Вишгород,","addressLine2":"вул. Садова, 15","phone":"+380 (67) 123-45-67","email":"info@zeleni-yanholy.ua","hoursWeekdays":"Пн-Пт: 9:00 - 18:00","hoursSaturday":"Сб: 9:00 - 15:00"}'
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'page.home',
    '{"hero":{"badge":"Виробник рослин · відома торгова марка","title":"Розсадник «Зелені Янголи»","titleAccent":"для професіоналів і садівників","subtitle":"Власне виробництво хвойних, листяних і декоративних рослин. Тисячі задоволених клієнтів по всій Україні — від приватних садів до великих ландшафтних проєктів.","primaryCtaLabel":"Перейти до каталогу","primaryCtaHref":"/catalog","secondaryCtaLabel":"Хіти продажів","secondaryCtaHref":"/#bestsellers","imageUrl":"/images/hero-plants.jpg","highlights":[{"title":"Власне виробництво","description":"Вирощуємо на розсаднику, не перепродаємо"},{"title":"5000+ клієнтів","description":"Працюємо з роздрібом і гуртом по Україні"},{"title":"Доставка Нова Пошта","description":"Надійне пакування та відправлення"}]},"categories":{"title":"Категорії рослин","subtitle":"Понад 500 позицій у каталозі — оберіть напрямок і замовляйте напряму з розсадника","limit":8},"bestsellers":{"title":"Хіти продажів","subtitle":"Найпопулярніші позиції, які обирають наші клієнти знову і знову","limit":16,"productSlugs":[]},"whyUs":{"title":"Чому обирають Зелені Янголи","subtitle":"Ми — виробник посадкового матеріалу з багаторічною репутацією. Нам довіряють садівні центри, ландшафтні компанії та приватні клієнти.","features":["Власні поля, теплиці та склади","Стабільна якість і сортність","Великий асортимент у наявності","Оптові та роздрібні ціни","Доставка по всій Україні","Відома торгова марка на ринку"],"stats":[{"value":"15+","label":"років на ринку"},{"value":"500+","label":"позицій у каталозі"},{"value":"5000+","label":"клієнтів"},{"value":"100%","label":"власне виробництво"}]},"nurseryGallery":{"title":"Наш розсадник","subtitle":"Поля, теплиці, вирощування та пакування — усе під нашим контролем","images":[{"url":"/images/nursery/field.jpg","caption":"Поля розсадника"},{"url":"/images/nursery/greenhouse.jpg","caption":"Теплиці вирощування"},{"url":"/images/nursery/warehouse.jpg","caption":"Склад з горщиками"},{"url":"/images/nursery/packing.jpg","caption":"Пакування для відправлення"}]},"reviews":{"title":"Відгуки клієнтів","subtitle":"Нам довіряють професіонали та садівники з усієї України","items":[{"name":"Олена К.","text":"Чудовий розсадник! Рослини приїхали в ідеальному стані, добре запаковані. Туї та сосни відмінної якості.","rating":5},{"name":"Андрій М.","text":"Замовляв велике замовлення для ландшафтного проєкту. Якість посадкового матеріалу на висоті, працюємо вже не перший рік.","rating":5},{"name":"Марія С.","text":"Дуже вдячна за швидку доставку Новою Поштою. Рослини здорові, відповідають опису. Обовʼязково замовлятиму ще.","rating":5},{"name":"Ігор В.","text":"Купував декоративні чагарники для ділянки. Усе відповідає каталогу, рослини сильні та добре вкорінені.","rating":4}]}}'
  )
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "Settings" ("id", "key", "value")
VALUES (
  'b0000000-0000-4000-8000-000000000003',
  'commerce.defaults',
  '{"defaultCurrencyCode":"UAH","defaultSalesUnitCode":"pcs"}'
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "CustomerGroup" ("id", "name", "slug", "description", "isActive", "createdAt", "updatedAt")
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Роздріб', 'retail', 'Звичайні покупці', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000002', 'Гурт', 'wholesale', 'Оптові клієнти та контрагенти', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "Characteristic" ("id", "slug", "valueType", "sortOrder", "isFilterable", "showOnProductPage", "icon")
VALUES
  ('c1000000-0000-4000-8000-000000000001', 'sun-requirement', 'SELECT', 0, true, true, 'Sun'),
  ('c1000000-0000-4000-8000-000000000002', 'soil-type', 'SELECT', 1, true, true, 'Mountain'),
  ('c1000000-0000-4000-8000-000000000003', 'hardiness-zone', 'SELECT', 2, true, true, 'Thermometer'),
  ('c1000000-0000-4000-8000-000000000004', 'watering-needs', 'SELECT', 3, true, true, 'Droplets'),
  ('c1000000-0000-4000-8000-000000000005', 'height', 'TEXT', 4, false, true, 'ArrowUpDown')
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "CharacteristicTranslation" ("id", "locale", "name", "characteristicId")
VALUES
  ('c1100000-0000-4000-8000-000000000001', 'uk', 'Освітлення', 'c1000000-0000-4000-8000-000000000001'),
  ('c1100000-0000-4000-8000-000000000002', 'uk', 'Тип ґрунту', 'c1000000-0000-4000-8000-000000000002'),
  ('c1100000-0000-4000-8000-000000000003', 'uk', 'Зона морозостійкості', 'c1000000-0000-4000-8000-000000000003'),
  ('c1100000-0000-4000-8000-000000000004', 'uk', 'Полив', 'c1000000-0000-4000-8000-000000000004'),
  ('c1100000-0000-4000-8000-000000000005', 'uk', 'Висота', 'c1000000-0000-4000-8000-000000000005')
ON CONFLICT ("characteristicId", "locale") DO NOTHING;

INSERT INTO "CharacteristicOption" ("id", "slug", "sortOrder", "characteristicId")
VALUES
  ('c1200000-0000-4000-8000-000000000001', 'full-sun', 0, 'c1000000-0000-4000-8000-000000000001'),
  ('c1200000-0000-4000-8000-000000000002', 'partial-shade', 1, 'c1000000-0000-4000-8000-000000000001'),
  ('c1200000-0000-4000-8000-000000000003', 'full-shade', 2, 'c1000000-0000-4000-8000-000000000001'),
  ('c1200000-0000-4000-8000-000000000004', 'acidic', 0, 'c1000000-0000-4000-8000-000000000002'),
  ('c1200000-0000-4000-8000-000000000005', 'neutral', 1, 'c1000000-0000-4000-8000-000000000002'),
  ('c1200000-0000-4000-8000-000000000006', 'alkaline', 2, 'c1000000-0000-4000-8000-000000000002'),
  ('c1200000-0000-4000-8000-000000000007', 'any', 3, 'c1000000-0000-4000-8000-000000000002'),
  ('c1200000-0000-4000-8000-000000000008', '2-7', 0, 'c1000000-0000-4000-8000-000000000003'),
  ('c1200000-0000-4000-8000-000000000009', '3-7', 1, 'c1000000-0000-4000-8000-000000000003'),
  ('c1200000-0000-4000-8000-00000000000a', '3-8', 2, 'c1000000-0000-4000-8000-000000000003'),
  ('c1200000-0000-4000-8000-00000000000b', '3-9', 3, 'c1000000-0000-4000-8000-000000000003'),
  ('c1200000-0000-4000-8000-00000000000c', '4-7', 4, 'c1000000-0000-4000-8000-000000000003'),
  ('c1200000-0000-4000-8000-00000000000d', '4-8', 5, 'c1000000-0000-4000-8000-000000000003'),
  ('c1200000-0000-4000-8000-00000000000e', 'low', 0, 'c1000000-0000-4000-8000-000000000004'),
  ('c1200000-0000-4000-8000-00000000000f', 'moderate', 1, 'c1000000-0000-4000-8000-000000000004'),
  ('c1200000-0000-4000-8000-000000000010', 'high', 2, 'c1000000-0000-4000-8000-000000000004')
ON CONFLICT ("characteristicId", "slug") DO NOTHING;

INSERT INTO "CharacteristicOptionTranslation" ("id", "locale", "label", "optionId")
VALUES
  ('c1300000-0000-4000-8000-000000000001', 'uk', 'Повне сонце', 'c1200000-0000-4000-8000-000000000001'),
  ('c1300000-0000-4000-8000-000000000002', 'uk', 'Напівтінь', 'c1200000-0000-4000-8000-000000000002'),
  ('c1300000-0000-4000-8000-000000000003', 'uk', 'Тінь', 'c1200000-0000-4000-8000-000000000003'),
  ('c1300000-0000-4000-8000-000000000004', 'uk', 'Кислий', 'c1200000-0000-4000-8000-000000000004'),
  ('c1300000-0000-4000-8000-000000000005', 'uk', 'Нейтральний', 'c1200000-0000-4000-8000-000000000005'),
  ('c1300000-0000-4000-8000-000000000006', 'uk', 'Лужний', 'c1200000-0000-4000-8000-000000000006'),
  ('c1300000-0000-4000-8000-000000000007', 'uk', 'Будь-який', 'c1200000-0000-4000-8000-000000000007'),
  ('c1300000-0000-4000-8000-000000000008', 'uk', 'Зона 2-7', 'c1200000-0000-4000-8000-000000000008'),
  ('c1300000-0000-4000-8000-000000000009', 'uk', 'Зона 3-7', 'c1200000-0000-4000-8000-000000000009'),
  ('c1300000-0000-4000-8000-00000000000a', 'uk', 'Зона 3-8', 'c1200000-0000-4000-8000-00000000000a'),
  ('c1300000-0000-4000-8000-00000000000b', 'uk', 'Зона 3-9', 'c1200000-0000-4000-8000-00000000000b'),
  ('c1300000-0000-4000-8000-00000000000c', 'uk', 'Зона 4-7', 'c1200000-0000-4000-8000-00000000000c'),
  ('c1300000-0000-4000-8000-00000000000d', 'uk', 'Зона 4-8', 'c1200000-0000-4000-8000-00000000000d'),
  ('c1300000-0000-4000-8000-00000000000e', 'uk', 'Низькі', 'c1200000-0000-4000-8000-00000000000e'),
  ('c1300000-0000-4000-8000-00000000000f', 'uk', 'Помірні', 'c1200000-0000-4000-8000-00000000000f'),
  ('c1300000-0000-4000-8000-000000000010', 'uk', 'Високі', 'c1200000-0000-4000-8000-000000000010')
ON CONFLICT ("optionId", "locale") DO NOTHING;

INSERT INTO "Currency" ("code", "symbol", "isoNumericCode", "decimals", "isActive", "sortOrder", "updatedAt") VALUES
  ('UAH', '₴', 980, 2, true, 1, CURRENT_TIMESTAMP),
  ('EUR', '€', 978, 2, true, 2, CURRENT_TIMESTAMP),
  ('PLN', 'zł', 985, 2, true, 3, CURRENT_TIMESTAMP),
  ('CZK', 'Kč', 203, 2, true, 4, CURRENT_TIMESTAMP),
  ('HUF', 'Ft', 348, 0, true, 5, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "CurrencyTranslation" ("id", "locale", "name", "currencyCode") VALUES
  ('31000000-0000-4000-8000-000000000001', 'uk', 'Гривня', 'UAH'),
  ('31000000-0000-4000-8000-000000000002', 'en', 'Ukrainian hryvnia', 'UAH'),
  ('31000000-0000-4000-8000-000000000003', 'sk', 'Ukrajinská hrivna', 'UAH'),
  ('31000000-0000-4000-8000-000000000004', 'uk', 'Євро', 'EUR'),
  ('31000000-0000-4000-8000-000000000005', 'en', 'Euro', 'EUR'),
  ('31000000-0000-4000-8000-000000000006', 'sk', 'Euro', 'EUR'),
  ('31000000-0000-4000-8000-000000000007', 'uk', 'Злотий', 'PLN'),
  ('31000000-0000-4000-8000-000000000008', 'en', 'Polish zloty', 'PLN'),
  ('31000000-0000-4000-8000-000000000009', 'sk', 'Poľský zlotý', 'PLN'),
  ('31000000-0000-4000-8000-00000000000a', 'uk', 'Чеська крона', 'CZK'),
  ('31000000-0000-4000-8000-00000000000b', 'en', 'Czech koruna', 'CZK'),
  ('31000000-0000-4000-8000-00000000000c', 'sk', 'Česká koruna', 'CZK'),
  ('31000000-0000-4000-8000-00000000000d', 'uk', 'Форинт', 'HUF'),
  ('31000000-0000-4000-8000-00000000000e', 'en', 'Hungarian forint', 'HUF'),
  ('31000000-0000-4000-8000-00000000000f', 'sk', 'Maďarský forint', 'HUF'),
  ('31000000-0000-4000-8000-000000000010', 'hu', 'Magyar forint', 'HUF'),
  ('31000000-0000-4000-8000-000000000011', 'de', 'Ungarischer Forint', 'HUF')
ON CONFLICT ("currencyCode", "locale") DO NOTHING;

INSERT INTO "UnitOfMeasure" ("id", "code", "symbol", "type", "decimals", "isActive", "sortOrder", "updatedAt") VALUES
  ('00000000-0000-4000-8000-000000000001', 'pcs', 'шт', 'COUNT', 0, true, 1, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000002', 'kg', 'кг', 'WEIGHT', 3, true, 2, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000003', 'g', 'г', 'WEIGHT', 0, true, 3, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000004', 'l', 'л', 'VOLUME', 2, true, 4, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000005', 'ml', 'мл', 'VOLUME', 0, true, 5, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000006', 'cm', 'см', 'LENGTH', 0, true, 6, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000007', 'm', 'м', 'LENGTH', 2, true, 7, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000008', 'm2', 'м²', 'AREA', 2, true, 8, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "UnitOfMeasureTranslation" ("id", "locale", "name", "unitId") VALUES
  ('32000000-0000-4000-8000-000000000001', 'uk', 'Штука', '00000000-0000-4000-8000-000000000001'),
  ('32000000-0000-4000-8000-000000000002', 'en', 'Piece', '00000000-0000-4000-8000-000000000001'),
  ('32000000-0000-4000-8000-000000000003', 'sk', 'Kus', '00000000-0000-4000-8000-000000000001'),
  ('32000000-0000-4000-8000-000000000004', 'uk', 'Кілограм', '00000000-0000-4000-8000-000000000002'),
  ('32000000-0000-4000-8000-000000000005', 'en', 'Kilogram', '00000000-0000-4000-8000-000000000002'),
  ('32000000-0000-4000-8000-000000000006', 'sk', 'Kilogram', '00000000-0000-4000-8000-000000000002'),
  ('32000000-0000-4000-8000-000000000007', 'uk', 'Грам', '00000000-0000-4000-8000-000000000003'),
  ('32000000-0000-4000-8000-000000000008', 'en', 'Gram', '00000000-0000-4000-8000-000000000003'),
  ('32000000-0000-4000-8000-000000000009', 'sk', 'Gram', '00000000-0000-4000-8000-000000000003'),
  ('32000000-0000-4000-8000-00000000000a', 'uk', 'Літр', '00000000-0000-4000-8000-000000000004'),
  ('32000000-0000-4000-8000-00000000000b', 'en', 'Litre', '00000000-0000-4000-8000-000000000004'),
  ('32000000-0000-4000-8000-00000000000c', 'sk', 'Liter', '00000000-0000-4000-8000-000000000004'),
  ('32000000-0000-4000-8000-00000000000d', 'uk', 'Мілілітр', '00000000-0000-4000-8000-000000000005'),
  ('32000000-0000-4000-8000-00000000000e', 'en', 'Millilitre', '00000000-0000-4000-8000-000000000005'),
  ('32000000-0000-4000-8000-00000000000f', 'sk', 'Mililiter', '00000000-0000-4000-8000-000000000005'),
  ('32000000-0000-4000-8000-000000000010', 'uk', 'Сантиметр', '00000000-0000-4000-8000-000000000006'),
  ('32000000-0000-4000-8000-000000000011', 'en', 'Centimetre', '00000000-0000-4000-8000-000000000006'),
  ('32000000-0000-4000-8000-000000000012', 'sk', 'Centimeter', '00000000-0000-4000-8000-000000000006'),
  ('32000000-0000-4000-8000-000000000013', 'uk', 'Метр', '00000000-0000-4000-8000-000000000007'),
  ('32000000-0000-4000-8000-000000000014', 'en', 'Metre', '00000000-0000-4000-8000-000000000007'),
  ('32000000-0000-4000-8000-000000000015', 'sk', 'Meter', '00000000-0000-4000-8000-000000000007'),
  ('32000000-0000-4000-8000-000000000016', 'uk', 'Квадратний метр', '00000000-0000-4000-8000-000000000008'),
  ('32000000-0000-4000-8000-000000000017', 'en', 'Square metre', '00000000-0000-4000-8000-000000000008'),
  ('32000000-0000-4000-8000-000000000018', 'sk', 'Štvorcový meter', '00000000-0000-4000-8000-000000000008')
ON CONFLICT ("unitId", "locale") DO NOTHING;

INSERT INTO "OrderStatusDefinition" ("id", "code", "nameUk", "nameEn", "nameSk", "color", "sortOrder", "isActive", "isSystem", "isTerminal", "externalCode", "updatedAt") VALUES
  ('10000000-0000-4000-8000-000000000001', 'PENDING', 'Очікує', 'Pending', 'Čaká', 'yellow', 10, true, true, false, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000002', 'AWAITING_PAYMENT', 'Очікує оплату', 'Awaiting payment', 'Čaká na platbu', 'orange', 20, true, true, false, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000003', 'PROCESSING', 'В обробці', 'Processing', 'Spracováva sa', 'blue', 30, true, true, false, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000007', 'AWAITING_STOCK', 'Очікує товар', 'Awaiting stock', 'Čaká na tovar', 'orange', 25, true, true, false, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000008', 'PICKING', 'На зборі', 'Picking', 'Na zbere', 'blue', 32, true, true, false, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000009', 'PACKED', 'Спаковано', 'Packed', 'Zabalené', 'blue', 35, true, true, false, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000004', 'SHIPPED', 'Відправлено', 'Shipped', 'Odoslané', 'purple', 40, true, true, false, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000005', 'DELIVERED', 'Доставлено', 'Delivered', 'Doručené', 'green', 50, true, true, true, NULL, CURRENT_TIMESTAMP),
  ('10000000-0000-4000-8000-000000000006', 'CANCELLED', 'Скасовано', 'Cancelled', 'Zrušené', 'red', 60, true, true, true, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "CancellationReason" ("id", "code", "nameUk", "nameEn", "nameSk", "allowAdmin", "allowUser", "allowSystem", "isActive", "sortOrder", "updatedAt") VALUES
  ('20000000-0000-4000-8000-000000000001', 'customer_request', 'Запит клієнта', 'Customer request', 'Žiadosť zákazníka', true, true, false, true, 10, CURRENT_TIMESTAMP),
  ('20000000-0000-4000-8000-000000000002', 'out_of_stock', 'Немає в наявності', 'Out of stock', 'Nie je na sklade', true, false, false, true, 20, CURRENT_TIMESTAMP),
  ('20000000-0000-4000-8000-000000000003', 'payment_failed', 'Проблема з оплатою', 'Payment issue', 'Problém s platbou', true, false, true, true, 30, CURRENT_TIMESTAMP),
  ('20000000-0000-4000-8000-000000000004', 'duplicate', 'Дубль замовлення', 'Duplicate order', 'Duplicitná objednávka', true, false, false, true, 40, CURRENT_TIMESTAMP),
  ('20000000-0000-4000-8000-000000000005', 'other', 'Інше', 'Other', 'Iné', true, true, true, true, 90, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "VatCountryRate" ("id", "countryCode", "rateType", "percent", "cnPrefixes", "source", "validFrom", "updatedAt") VALUES
  ('40000000-0000-4000-8000-000000000001', 'sk', 'standard', 23, ARRAY[]::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('40000000-0000-4000-8000-000000000002', 'hu', 'standard', 27, ARRAY[]::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('40000000-0000-4000-8000-000000000003', 'at', 'standard', 20, ARRAY[]::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('40000000-0000-4000-8000-000000000004', 'at', 'reduced', 10, ARRAY['0601','0602']::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('40000000-0000-4000-8000-000000000005', 'cz', 'standard', 21, ARRAY[]::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('40000000-0000-4000-8000-000000000006', 'cz', 'reduced', 12, ARRAY['0601','0602']::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('40000000-0000-4000-8000-000000000007', 'de', 'standard', 19, ARRAY[]::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('40000000-0000-4000-8000-000000000008', 'de', 'reduced', 7, ARRAY['0601','0602']::TEXT[], 'seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("countryCode", "rateType", "percent") DO NOTHING;
