#!/usr/bin/env bash
# Isolated empty-Postgres production-like check for REL-MIGRATE-001.
# Does not touch the development compose project or its volumes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HAPPY_PROJECT="${REL_MIGRATE_PROJECT:-ga-rel-migrate-verify}"
FAIL_PROJECT="${REL_MIGRATE_FAIL_PROJECT:-ga-rel-migrate-fail}"
VERIFY_FILE="$ROOT/docker-compose.rel-migrate-verify.yml"
FAIL_FILE="$ROOT/docker-compose.rel-migrate-fail.override.yml"
PROD_FILE="$ROOT/docker-compose.prod.yml"
COOLIFY_FILE="$ROOT/docker-compose.coolify.yml"

happy=(docker compose -p "$HAPPY_PROJECT" -f "$VERIFY_FILE")
fail=(docker compose -p "$FAIL_PROJECT" -f "$VERIFY_FILE" -f "$FAIL_FILE")

cleanup() {
  "${happy[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  "${fail[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> 1. docker compose prod + coolify config (dummy interpolation, no secret dump)"
CONFIG_ENV="$(mktemp)"
cat >"$CONFIG_ENV" <<'EOF'
POSTGRES_USER=green_angels
POSTGRES_PASSWORD=compose-config-check
POSTGRES_DB=green_angels
DATABASE_URL=postgresql://green_angels:compose-config-check@postgres:5432/green_angels?schema=public
REDIS_HOST=redis-coolify-check
REDIS_PASSWORD=compose-config-check
JWT_SECRET=compose-config-check-min-32-characters
CORS_ORIGIN=https://shop.example.com
API_PUBLIC_URL=https://api.example.com
SHOP_PUBLIC_URL=https://shop.example.com
R2_ENDPOINT=https://example.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=config-check
R2_SECRET_ACCESS_KEY=config-check
R2_BUCKET=config-check
R2_PUBLIC_BASE_URL=https://media.example.com
EOF
CONFIG_OUT="$(mktemp)"
docker compose --env-file "$CONFIG_ENV" -f "$PROD_FILE" config >"$CONFIG_OUT"
python3 - "$CONFIG_OUT" <<'PY'
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text()
flat = " ".join(text.split())
m = re.search(r"(?ms)^services:\n(.*?)(?=^[a-z]|\Z)", text)
if not m:
    raise SystemExit("prod config missing services block")
names = set(re.findall(r"^  ([a-zA-Z0-9_-]+):", m.group(1), re.M))
expected = {"postgres", "redis", "migrate", "api"}
if names != expected:
    raise SystemExit(f"prod services {sorted(names)} != {sorted(expected)}")
if "caddy" in names:
    raise SystemExit("prod config must not include caddy")
if re.search(r"(?m)^\s*published:\s*['\"]?80['\"]?\s*$", text) or re.search(
    r"(?m)^\s*published:\s*['\"]?443['\"]?\s*$", text
):
    raise SystemExit("prod config must not publish host 80/443")
if "service_completed_successfully" not in text:
    raise SystemExit("prod config missing migrate → api condition service_completed_successfully")
if "- prisma - migrate - deploy" not in flat and "prisma migrate deploy" not in flat:
    raise SystemExit("prod config missing prisma migrate deploy command")
if "restart: no" not in flat and 'restart: "no"' not in text and "restart: 'no'" not in text:
    raise SystemExit("prod config migrate restart is not no")
print("prod config: hostpro services, no caddy/80/443, migrate gate")
PY
docker compose --env-file "$CONFIG_ENV" -f "$COOLIFY_FILE" config >"$CONFIG_OUT"
python3 - "$CONFIG_OUT" <<'PY'
import re
import sys
from pathlib import Path

text = Path(sys.argv[1]).read_text()
flat = " ".join(text.split())
m = re.search(r"(?ms)^services:\n(.*?)(?=^[a-z]|\Z)", text)
if not m:
    raise SystemExit("coolify config missing services block")
names = set(re.findall(r"^  ([a-zA-Z0-9_-]+):", m.group(1), re.M))
expected = {"migrate", "api"}
if names != expected:
    raise SystemExit(f"coolify services {sorted(names)} != {sorted(expected)}")
if "caddy" in names:
    raise SystemExit("coolify config must not include caddy")
if re.search(r"(?m)^\s*published:\s*['\"]?80['\"]?\s*$", text) or re.search(
    r"(?m)^\s*published:\s*['\"]?443['\"]?\s*$", text
):
    raise SystemExit("coolify config must not publish host 80/443")
if "service_completed_successfully" not in text:
    raise SystemExit("coolify config missing migrate → api condition service_completed_successfully")
if "- prisma - migrate - deploy" not in flat and "prisma migrate deploy" not in flat:
    raise SystemExit("coolify config missing prisma migrate deploy command")
if "restart: no" not in flat and 'restart: "no"' not in text and "restart: 'no'" not in text:
    raise SystemExit("coolify config migrate restart is not no")
print("coolify config: migrate+api only, no caddy/80/443, migrate gate")
if "published:" in text:
    raise SystemExit("coolify config must not publish host ports")
if re.search(r'(?m)^\s+REDIS_HOST:\s+redis\s*$', text) or re.search(
    r'(?m)^\s+REDIS_HOST:\s+["\']redis["\']\s*$', text
):
    raise SystemExit("coolify api must not use HostPro hostname redis")
if any(s in text for s in ("MONOPAY_TOKEN", "NOVA_POSHTA", "TURBOSMS_", "MAX_PHOTOS_PER_SIZE", "POSTGRES_USER")):
    raise SystemExit("coolify config contains UA/HostPro or dead env interpolations")
print("coolify config: SK contract (no UA-only / dead env)")
PY
python3 - "$COOLIFY_FILE" <<'PY'
import re
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_text()
m = re.search(r"(?ms)^  migrate:\n(.*?)^  api:", raw)
if not m:
    raise SystemExit("coolify yaml missing migrate/api split")
migrate_block = m.group(1)
env_m = re.search(r"(?ms)^\s{4}environment:\n((?:\s{6}.+\n)+)", migrate_block)
if not env_m:
    raise SystemExit("coolify migrate missing environment block")
mig_keys = re.findall(r"^\s{6}([A-Z][A-Z0-9_]+):", env_m.group(1), re.M)
if mig_keys != ["DATABASE_URL"]:
    raise SystemExit(f"migrate environment must be DATABASE_URL only, got {mig_keys}")
print(f"coolify yaml: migrate keys={mig_keys}")
PY
rm -f "$CONFIG_ENV" "$CONFIG_OUT"

echo "==> 2. empty postgres → migrate → api (isolated project $HAPPY_PROJECT)"
"${happy[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
"${happy[@]}" build migrate api
"${happy[@]}" up -d --wait --wait-timeout 180

echo "==> 3. prisma migrate status (expect Database schema is up to date)"
STATUS="$("${happy[@]}" run --rm --no-deps migrate npx --no-install prisma migrate status)"
echo "$STATUS"
echo "$STATUS" | grep -q "Database schema is up to date"
if echo "$STATUS" | grep -Eqi "drift|failed migration|Migration .* failed"; then
  echo "MIGRATION HISTORY ISSUE"
  exit 1
fi

echo "==> 4. idempotent second migrate deploy"
"${happy[@]}" run --rm --no-deps migrate npx --no-install prisma migrate deploy

echo "==> 5. GET /health"
HEALTH="$(curl -fsS http://127.0.0.1:13001/health)"
echo "$HEALTH" | grep -q '"ok":true'

echo "==> 6. failure: migrate cannot connect → api must not start"
"${fail[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
set +e
"${fail[@]}" up -d postgres redis >/dev/null
"${fail[@]}" up migrate --abort-on-container-exit --exit-code-from migrate
MIGRATE_EC=$?
set -e
if [[ "$MIGRATE_EC" -eq 0 ]]; then
  echo "expected migrate non-zero exit, got 0"
  exit 1
fi
set +e
"${fail[@]}" up -d api
set -e
API_STATE="$("${fail[@]}" ps api --format '{{.State}}' 2>/dev/null || true)"
if echo "$API_STATE" | grep -Eq 'running|healthy'; then
  echo "api started after failed migrate (state=$API_STATE)"
  exit 1
fi
echo "failure test: migrate exit=$MIGRATE_EC api_state=${API_STATE:-not-running}"

echo "rel-prisma-migrate-verify: ok"
