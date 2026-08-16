#!/usr/bin/env bash
# Isolated empty-Postgres verification for 00000000000000_baseline.
# Does NOT use development compose, port 5432, or green-angels-postgres.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NAME="${GA_BASELINE_PG_NAME:-ga-prisma-baseline-verify}"
PORT="${GA_BASELINE_PG_PORT:-55432}"
USER="ga_baseline"
PASS="ga_baseline"
DB="ga_baseline"
URL="postgresql://${USER}:${PASS}@127.0.0.1:${PORT}/${DB}?schema=public"

MIG_DIR="$ROOT/prisma/migrations"
TMP_MIG_NAME="20991231120000_baseline_verify_tmp"
TMP_MIG="$MIG_DIR/$TMP_MIG_NAME"

cleanup() {
  rm -rf "$TMP_MIG"
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> 0. active migrations directory must only contain the baseline"
python3 - "$MIG_DIR" <<'PY'
import sys
from pathlib import Path
mig = Path(sys.argv[1])
dirs = sorted(p.name for p in mig.iterdir() if p.is_dir())
if dirs != ["00000000000000_baseline"]:
    raise SystemExit(f"unexpected active migration dirs: {dirs}")
archive = mig.parent / "migrations-archive"
n = len([p for p in archive.iterdir() if p.is_dir()])
if n != 65:
    raise SystemExit(f"expected 65 archived folders, found {n}")
print(f"active={dirs} archived_folders={n}")
PY

echo "==> 1. start isolated PostgreSQL on 127.0.0.1:${PORT}"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" \
  -e POSTGRES_USER="$USER" \
  -e POSTGRES_PASSWORD="$PASS" \
  -e POSTGRES_DB="$DB" \
  -p "127.0.0.1:${PORT}:5432" \
  postgres:16-alpine >/dev/null

for _ in $(seq 1 40); do
  if docker exec "$NAME" pg_isready -U "$USER" -d "$DB" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
docker exec "$NAME" pg_isready -U "$USER" -d "$DB" >/dev/null

echo "==> 2. empty DB → prisma migrate deploy (expect baseline only)"
DEPLOY1="$(DATABASE_URL="$URL" npx prisma migrate deploy)"
echo "$DEPLOY1"
echo "$DEPLOY1" | grep -q "00000000000000_baseline"
echo "$DEPLOY1" | grep -q "Applying migration \`00000000000000_baseline\`"
if echo "$DEPLOY1" | grep -Eq "cart_guest_sessions|20250604120000_init|migrations-archive"; then
  echo "archived migration was executed"
  exit 1
fi

echo "==> 3. prisma migrate status"
STATUS1="$(DATABASE_URL="$URL" npx prisma migrate status)"
echo "$STATUS1"
echo "$STATUS1" | grep -q "Database schema is up to date"
echo "$STATUS1" | grep -q "1 migration found"

echo "==> 4. _prisma_migrations + schema objects + reference data"
q() {
  docker exec -e PGPASSWORD="$PASS" "$NAME" psql -U "$USER" -d "$DB" -tAc "$1"
}
expect() {
  local got label want
  label="$1"
  want="$2"
  got="$(q "$3" | tr -d '[:space:]')"
  echo "  $label=$got (want $want)"
  if [[ "$got" != "$want" ]]; then
    echo "assertion failed: $label"
    exit 1
  fi
}

expect "migrations" "1" "SELECT COUNT(*) FROM _prisma_migrations"
expect "baseline_name" "00000000000000_baseline" "SELECT migration_name FROM _prisma_migrations"
expect "baseline_finished" "t" "SELECT finished_at IS NOT NULL FROM _prisma_migrations WHERE migration_name = '00000000000000_baseline'"
expect "pg_trgm" "pg_trgm" "SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'"
expect "gin_indexes" "4" "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('Product_latinName_trgm_idx','Product_slug_trgm_idx','ProductTranslation_name_trgm_idx','CategoryTranslation_name_trgm_idx')"
expect "discount_updatedat_default" "t" "SELECT column_default LIKE '%CURRENT_TIMESTAMP%' FROM information_schema.columns WHERE table_schema='public' AND table_name='DiscountRule' AND column_name='updatedAt'"
expect "enums" "15" "SELECT COUNT(*) FROM pg_type WHERE typtype='e' AND typnamespace='public'::regnamespace"
expect "user_table" "t" "SELECT to_regclass('public.\"User\"') IS NOT NULL"
expect "account_table" "t" "SELECT to_regclass('public.\"Account\"') IS NOT NULL"
expect "cart_table" "t" "SELECT to_regclass('public.\"Cart\"') IS NOT NULL"
expect "photo_index" "t" "SELECT to_regclass('public.photo_index') IS NOT NULL"
expect "currencies" "5" "SELECT COUNT(*) FROM \"Currency\""
expect "units" "8" "SELECT COUNT(*) FROM \"UnitOfMeasure\""
expect "groups" "2" "SELECT COUNT(*) FROM \"CustomerGroup\""
expect "statuses" "9" "SELECT COUNT(*) FROM \"OrderStatusDefinition\""
expect "cancel_reasons" "5" "SELECT COUNT(*) FROM \"CancellationReason\""
expect "vat_seeds" "8" "SELECT COUNT(*) FROM \"VatCountryRate\""
expect "chars" "5" "SELECT COUNT(*) FROM \"Characteristic\""
expect "settings" "3" "SELECT COUNT(*) FROM \"Settings\""
expect "admin_user" "1" "SELECT COUNT(*) FROM \"User\" WHERE email = 'dev.green.angels@gmail.com'"
expect "phone_nullable" "YES" "SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name='phone'"
got_fk="$(q "SELECT COUNT(*) FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND table_schema='public'" | tr -d '[:space:]')"
echo "  foreign_keys=$got_fk"
if [[ "$got_fk" -lt 50 ]]; then
  echo "expected many foreign keys"
  exit 1
fi

echo "==> 5. future migration then repeated deploy"
mkdir -p "$TMP_MIG"
printf '%s\n' 'CREATE TABLE "_BaselineVerifyTmp" ("id" TEXT NOT NULL, CONSTRAINT "_BaselineVerifyTmp_pkey" PRIMARY KEY ("id"));' \
  > "$TMP_MIG/migration.sql"

DEPLOY2="$(DATABASE_URL="$URL" npx prisma migrate deploy)"
echo "$DEPLOY2"
echo "$DEPLOY2" | grep -q "$TMP_MIG_NAME"
if echo "$DEPLOY2" | grep -q "Applying migration \`00000000000000_baseline\`"; then
  echo "baseline ran a second time"
  exit 1
fi

docker exec -e PGPASSWORD="$PASS" "$NAME" psql -U "$USER" -d "$DB" -c \
  'SELECT to_regclass($$public."_BaselineVerifyTmp"$$) IS NOT NULL AS tmp_table;'

DEPLOY3="$(DATABASE_URL="$URL" npx prisma migrate deploy)"
echo "$DEPLOY3"
echo "$DEPLOY3" | grep -q "No pending migrations to apply"

STATUS2="$(DATABASE_URL="$URL" npx prisma migrate status)"
echo "$STATUS2"
echo "$STATUS2" | grep -q "Database schema is up to date"

docker exec -e PGPASSWORD="$PASS" "$NAME" psql -U "$USER" -d "$DB" -c \
  "SELECT COUNT(*) AS applied FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"

echo "verify-prisma-baseline: ok"
