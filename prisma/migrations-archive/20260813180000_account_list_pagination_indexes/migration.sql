-- REL-007: account list hot paths (userId + createdAt)
CREATE INDEX IF NOT EXISTS "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Review_userId_createdAt_idx" ON "Review"("userId", "createdAt" DESC);
