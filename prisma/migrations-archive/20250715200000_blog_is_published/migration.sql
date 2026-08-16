-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BlogPost_isPublished_createdAt_idx" ON "BlogPost"("isPublished", "createdAt" DESC);
