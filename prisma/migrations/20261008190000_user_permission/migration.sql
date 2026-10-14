-- Staff permissions for MANAGER (ADMIN = implicit full access)

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "staffPermissionsInitializedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "user_permission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    CONSTRAINT "user_permission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_permission_userId_permission_key" ON "user_permission"("userId", "permission");
CREATE INDEX IF NOT EXISTS "user_permission_permission_idx" ON "user_permission"("permission");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_permission_userId_fkey'
  ) THEN
    ALTER TABLE "user_permission"
      ADD CONSTRAINT "user_permission_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_permission_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "user_permission"
      ADD CONSTRAINT "user_permission_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
