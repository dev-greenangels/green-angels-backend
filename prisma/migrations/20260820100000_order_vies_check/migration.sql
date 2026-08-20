-- AlterTable
ALTER TABLE "Order" ADD COLUMN "vatCountryCode" TEXT;

-- CreateTable
CREATE TABLE "OrderViesCheck" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "vatCountryCode" TEXT NOT NULL,
    "vatNumber" TEXT NOT NULL,
    "valid" BOOLEAN,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "viesRequestDate" TEXT,
    "requestIdentifier" TEXT,
    "registeredName" TEXT,
    "registeredAddress" TEXT,
    "requesterCountryCode" TEXT,
    "requesterVatNumber" TEXT,
    "source" TEXT NOT NULL,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderViesCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderViesCheck_orderId_key" ON "OrderViesCheck"("orderId");

-- AddForeignKey
ALTER TABLE "OrderViesCheck" ADD CONSTRAINT "OrderViesCheck_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
