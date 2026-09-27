-- AlterEnum: add customer lifecycle + manual types (PostgreSQL ADD VALUE; cannot run in transaction on older PG — Prisma handles)
ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'CUSTOMER_AWAITING_PAYMENT';
ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'CUSTOMER_PAYMENT_REMINDER';
ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'CUSTOMER_CANCELLED_UNPAID';
ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'CUSTOMER_LATE_PAY_REFUND';
ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'MANUAL_CUSTOMER_EMAIL';

-- AlterTable
ALTER TABLE "Communication" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Communication_createdByUserId_idx" ON "Communication"("createdByUserId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Communication_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "Communication"
      ADD CONSTRAINT "Communication_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
