-- CreateEnum
CREATE TYPE "OrderDocumentKind" AS ENUM ('CONFIRMATION_PDF');

-- CreateEnum
CREATE TYPE "CommunicationAudience" AS ENUM ('CUSTOMER', 'STAFF');

-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM (
  'ORDER_CONFIRMATION_PDF',
  'MANAGER_ORDER_READY',
  'MANAGER_ORDER_CANCELLED_UNPAID',
  'MANAGER_LATE_PAY_REFUND'
);

-- CreateEnum
CREATE TYPE "CommunicationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CommunicationSource" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateTable
CREATE TABLE "OrderDocument" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "OrderDocumentKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/pdf',
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Communication" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "userId" TEXT,
    "audience" "CommunicationAudience" NOT NULL,
    "type" "CommunicationType" NOT NULL,
    "source" "CommunicationSource" NOT NULL DEFAULT 'AUTOMATIC',
    "status" "CommunicationStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "toEmail" TEXT,
    "subjectSnapshot" TEXT,
    "bodySnapshot" TEXT,
    "locale" TEXT,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "orderDocumentId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Communication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderDocument_orderId_kind_key" ON "OrderDocument"("orderId", "kind");

-- CreateIndex
CREATE INDEX "OrderDocument_orderId_idx" ON "OrderDocument"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Communication_idempotencyKey_key" ON "Communication"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Communication_orderId_createdAt_idx" ON "Communication"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Communication_userId_createdAt_idx" ON "Communication"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Communication_audience_type_createdAt_idx" ON "Communication"("audience", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderDocument" ADD CONSTRAINT "OrderDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Communication" ADD CONSTRAINT "Communication_orderDocumentId_fkey" FOREIGN KEY ("orderDocumentId") REFERENCES "OrderDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
