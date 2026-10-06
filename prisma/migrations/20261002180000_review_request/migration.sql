-- Phase 2: secure ReviewRequest (opaque token hash, one per Order)

CREATE TABLE "ReviewRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "locale" TEXT,
    "createdByUserId" TEXT,
    "revokedByUserId" TEXT,
    "lastGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewRequest_orderId_key" ON "ReviewRequest"("orderId");
CREATE UNIQUE INDEX "ReviewRequest_tokenHash_key" ON "ReviewRequest"("tokenHash");
CREATE INDEX "ReviewRequest_expiresAt_idx" ON "ReviewRequest"("expiresAt");
CREATE INDEX "ReviewRequest_revokedAt_idx" ON "ReviewRequest"("revokedAt");
CREATE INDEX "ReviewRequest_createdByUserId_idx" ON "ReviewRequest"("createdByUserId");

ALTER TABLE "ReviewRequest"
  ADD CONSTRAINT "ReviewRequest_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReviewRequest"
  ADD CONSTRAINT "ReviewRequest_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReviewRequest"
  ADD CONSTRAINT "ReviewRequest_revokedByUserId_fkey"
  FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
