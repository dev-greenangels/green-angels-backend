INSERT INTO "User" (
  "id",
  "email",
  "firstName",
  "lastName",
  "passwordHash",
  "role",
  "emailVerified",
  "phoneVerified",
  "createdAt",
  "updatedAt"
)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'dev.green.angels@gmail.com',
  'Артур',
  'Деміч',
  '$2b$10$VtHLRn5ThORvJcp87lLwMu4q9OVUGPWJ.yI1nKgNDDnSqigZiXWXa',
  'ADMIN',
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE SET
  "firstName" = EXCLUDED."firstName",
  "lastName" = EXCLUDED."lastName",
  "passwordHash" = EXCLUDED."passwordHash",
  "role" = EXCLUDED."role",
  "emailVerified" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
