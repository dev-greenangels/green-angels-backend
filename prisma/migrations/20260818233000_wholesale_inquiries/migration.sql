-- CreateEnum
CREATE TYPE "WholesaleInquiryStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'CLOSED');

-- CreateTable
CREATE TABLE "WholesaleInquiry" (
    "id" TEXT NOT NULL,
    "status" "WholesaleInquiryStatus" NOT NULL DEFAULT 'NEW',
    "locale" TEXT NOT NULL,
    "marketRegion" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "website" TEXT,
    "message" TEXT,
    "companyIco" TEXT,
    "companyVatId" TEXT,
    "consentAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WholesaleInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WholesaleInquiry_status_createdAt_idx" ON "WholesaleInquiry"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WholesaleInquiry_email_createdAt_idx" ON "WholesaleInquiry"("email", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WholesaleInquiry_createdAt_idx" ON "WholesaleInquiry"("createdAt" DESC);

-- Presta CMS page → storefront wholesale landing (locale prefix stripped in proxy)
INSERT INTO "Redirect" ("id", "fromPath", "toPath", "statusCode", "isActive", "prefix", "hitCount", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-4000-8000-0000000000a1',
  '/content/6-gurt',
  '/wholesale',
  301,
  true,
  'content',
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("fromPath") DO NOTHING;
