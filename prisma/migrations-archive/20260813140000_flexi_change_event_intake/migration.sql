-- ERP-WEBHOOK-002A: durable Flexi change notification intake + safe cursor support

CREATE TABLE "FlexiChangeEvent" (
    "id" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "operation" TEXT NOT NULL DEFAULT '',
    "changeVersion" INTEGER NOT NULL DEFAULT 0,
    "inVersion" INTEGER,
    "rowGlobalVersion" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlexiChangeEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FlexiChangeEvent_evidence_objectId_changeVersion_key"
  ON "FlexiChangeEvent"("evidence", "objectId", "changeVersion");

CREATE INDEX "FlexiChangeEvent_status_changeVersion_idx"
  ON "FlexiChangeEvent"("status", "changeVersion");

CREATE INDEX "FlexiChangeEvent_status_evidence_objectId_idx"
  ON "FlexiChangeEvent"("status", "evidence", "objectId");

CREATE INDEX "FlexiChangeEvent_changeVersion_idx"
  ON "FlexiChangeEvent"("changeVersion");
