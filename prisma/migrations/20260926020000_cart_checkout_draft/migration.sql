-- Additive only: nullable checkout draft fields on Cart (no backfill).
ALTER TABLE "Cart" ADD COLUMN "checkoutDraft" JSONB,
ADD COLUMN "checkoutStartedAt" TIMESTAMP(3);
