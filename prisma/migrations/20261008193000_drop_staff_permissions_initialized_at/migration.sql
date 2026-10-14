-- Permissions are always enforced; legacy seed marker no longer used.
ALTER TABLE "User" DROP COLUMN IF EXISTS "staffPermissionsInitializedAt";
