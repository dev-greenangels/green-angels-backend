-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('TERMS', 'PRIVACY', 'COOKIES', 'RETURNS');

-- CreateEnum
CREATE TYPE "LegalRevisionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LegalConsentPurpose" AS ENUM ('TERMS', 'PRIVACY_NOTICE', 'COOKIES_ANALYTICS', 'MARKETING');

-- CreateEnum
CREATE TYPE "LegalConsentAction" AS ENUM ('GRANTED', 'WITHDRAWN', 'ACKNOWLEDGED');

-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocumentRevision" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" "LegalRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalDocumentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalConsentEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "anonymousConsentId" TEXT,
    "revisionId" TEXT NOT NULL,
    "purpose" "LegalConsentPurpose" NOT NULL,
    "action" "LegalConsentAction" NOT NULL,
    "locale" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_type_key" ON "LegalDocument"("type");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocumentRevision_documentId_locale_version_key" ON "LegalDocumentRevision"("documentId", "locale", "version");

-- CreateIndex
CREATE INDEX "LegalDocumentRevision_documentId_locale_status_publishedAt_idx" ON "LegalDocumentRevision"("documentId", "locale", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "LegalDocumentRevision_status_locale_idx" ON "LegalDocumentRevision"("status", "locale");

-- CreateIndex
CREATE INDEX "LegalConsentEvent_userId_occurredAt_idx" ON "LegalConsentEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "LegalConsentEvent_anonymousConsentId_occurredAt_idx" ON "LegalConsentEvent"("anonymousConsentId", "occurredAt");

-- CreateIndex
CREATE INDEX "LegalConsentEvent_orderId_idx" ON "LegalConsentEvent"("orderId");

-- CreateIndex
CREATE INDEX "LegalConsentEvent_revisionId_idx" ON "LegalConsentEvent"("revisionId");

-- CreateIndex
CREATE INDEX "LegalConsentEvent_purpose_occurredAt_idx" ON "LegalConsentEvent"("purpose", "occurredAt");

-- AddForeignKey
ALTER TABLE "LegalDocumentRevision" ADD CONSTRAINT "LegalDocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LegalDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalConsentEvent" ADD CONSTRAINT "LegalConsentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalConsentEvent" ADD CONSTRAINT "LegalConsentEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalConsentEvent" ADD CONSTRAINT "LegalConsentEvent_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "LegalDocumentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
