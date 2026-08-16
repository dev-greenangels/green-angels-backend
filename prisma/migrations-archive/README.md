# Archived Prisma migrations

These 65 folders are **historical documentation only**.

Prisma reads **only** `prisma/migrations/`. This directory is not part of the active history.

Do **not**:

- copy these folders back into `prisma/migrations/`
- edit `migration.sql` in this archive
- run them with `prisma migrate deploy`

New databases apply `prisma/migrations/00000000000000_baseline` then later timestamped migrations.

See `PRISMA_MIGRATION_BASELINE_AUDIT.md` and `PRISMA_BASELINE_IMPLEMENTATION_REPORT.md`.
