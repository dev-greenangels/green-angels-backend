-- Manual refund / return ops tracking on contract withdrawals (no payment automation).
ALTER TYPE "ContractWithdrawalStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_RETURN';
ALTER TYPE "ContractWithdrawalStatus" ADD VALUE IF NOT EXISTS 'RETURN_RECEIVED';
ALTER TYPE "ContractWithdrawalStatus" ADD VALUE IF NOT EXISTS 'REFUND_PENDING';
ALTER TYPE "ContractWithdrawalStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE "ContractWithdrawalStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

DO $$ BEGIN
  CREATE TYPE "ContractWithdrawalRefundMethod" AS ENUM (
    'ORIGINAL_PAYMENT_METHOD',
    'BANK_TRANSFER',
    'CASH_OR_COD_MANUAL',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "ContractWithdrawal"
  ADD COLUMN IF NOT EXISTS "returnReceivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refundRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "refundAmount" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "refundCurrency" TEXT,
  ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "refundMethod" "ContractWithdrawalRefundMethod",
  ADD COLUMN IF NOT EXISTS "refundReference" TEXT,
  ADD COLUMN IF NOT EXISTS "internalNote" TEXT,
  ADD COLUMN IF NOT EXISTS "processedByUserId" TEXT;

CREATE INDEX IF NOT EXISTS "ContractWithdrawal_processedByUserId_idx" ON "ContractWithdrawal"("processedByUserId");

DO $$ BEGIN
  ALTER TABLE "ContractWithdrawal"
    ADD CONSTRAINT "ContractWithdrawal_processedByUserId_fkey"
    FOREIGN KEY ("processedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
