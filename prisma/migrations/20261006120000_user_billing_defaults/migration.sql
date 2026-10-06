-- Account cabinet: saved billing/invoice defaults (individual | company).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "billingDefaults" JSONB;
