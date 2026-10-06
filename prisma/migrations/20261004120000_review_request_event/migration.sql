-- Phase 4: ReviewRequest append-only audit events

CREATE TYPE "ReviewRequestEventType" AS ENUM ('GENERATED', 'REGENERATED', 'REVOKED');

CREATE TABLE "ReviewRequestEvent" (
    "id" TEXT NOT NULL,
    "reviewRequestId" TEXT NOT NULL,
    "type" "ReviewRequestEventType" NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRequestEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReviewRequestEvent_reviewRequestId_createdAt_idx"
  ON "ReviewRequestEvent"("reviewRequestId", "createdAt" DESC);

CREATE INDEX "ReviewRequestEvent_createdByUserId_idx"
  ON "ReviewRequestEvent"("createdByUserId");

ALTER TABLE "ReviewRequestEvent"
  ADD CONSTRAINT "ReviewRequestEvent_reviewRequestId_fkey"
  FOREIGN KEY ("reviewRequestId") REFERENCES "ReviewRequest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReviewRequestEvent"
  ADD CONSTRAINT "ReviewRequestEvent_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
