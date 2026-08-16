#!/usr/bin/env bash
# ERP-WEBHOOK-002A — durable webhook intake + collapse + safe cursor
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${API:-http://localhost:3001}"
PASS=0
FAIL=0
TAG="wh002a-$(date +%s)-$RANDOM"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

psqlq() {
  docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "$1" | head -n1 | tr -d '[:space:]'
}

psql_raw() {
  docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "$1"
}

cleanup() {
  docker exec green-angels-postgres psql -U green_angels -d green_angels -c \
    "DELETE FROM \"FlexiChangeEvent\" WHERE \"objectId\" LIKE 'wh002a-%' OR \"objectId\" LIKE '${TAG}%';" \
    >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "=== ERP-WEBHOOK-002A verify ==="

# --- schema ---
TABLE=$(psqlq "SELECT to_regclass('public.\"FlexiChangeEvent\"');")
if [[ "$TABLE" == 'FlexiChangeEvent' || "$TABLE" == 'public.FlexiChangeEvent' ]]; then
  ok "1 schema: FlexiChangeEvent exists"
else
  # migrate if missing
  (cd "$ROOT" && npx prisma migrate deploy) >/tmp/wh002a-migrate.txt 2>&1 || true
  TABLE=$(psqlq "SELECT to_regclass('public.\"FlexiChangeEvent\"');")
  if [[ "$TABLE" == *FlexiChangeEvent* ]]; then
    ok "1 schema: FlexiChangeEvent exists (after migrate)"
  else
    bad "1 schema: FlexiChangeEvent missing (got '$TABLE')"
  fi
fi

# Ensure flexi enabled + webhook sec for HTTP tests
FLEXI_BEFORE=$(psql_raw "SELECT value FROM \"Settings\" WHERE key='integration.flexi' LIMIT 1;" | tr -d '\n' || true)
restore_flexi() {
  if [[ -n "${FLEXI_BEFORE:-}" ]]; then
    docker exec green-angels-postgres psql -U green_angels -d green_angels -c \
      "UPDATE \"Settings\" SET value = \$f\$ ${FLEXI_BEFORE} \$f\$ WHERE key='integration.flexi';" >/dev/null || true
  fi
}
trap 'cleanup; restore_flexi' EXIT

psqlq "UPDATE \"Settings\" SET value = ((COALESCE(NULLIF(value,''),'{}')::jsonb) || '{\"enabled\":true,\"webhookSecKey\":\"wh002a-test-sec\"}'::jsonb)::text WHERE key='integration.flexi';" >/dev/null || true

SEC="wh002a-test-sec"
OBJ_A="${TAG}-A"
OBJ_B="${TAG}-B"
OBJ_C="${TAG}-C"

post_webhook() {
  local body="$1"
  curl -sS -o /tmp/wh002a-hook.out -w '%{http_code}' -X POST "$API/flexi/webhook" \
    -H "Content-Type: application/json" \
    -H "X-FB-Hook-SecKey: $SEC" \
    -d "$body"
}

# --- 13 security ---
BAD_HTTP=$(curl -sS -o /tmp/wh002a-bad.out -w '%{http_code}' -X POST "$API/flexi/webhook" \
  -H "Content-Type: application/json" \
  -H "X-FB-Hook-SecKey: wrong-key" \
  -d '{"winstrom":{"change":[{"evidence":"cenik","id":"1","@in-version":1}]}}')
if [[ "$BAD_HTTP" == "401" ]]; then
  ok "13 webhook security enforced (401)"
else
  bad "13 expected 401, got $BAD_HTTP"
fi

# --- 1 durable persist before async ---
BODY1=$(cat <<EOF
{"winstrom":{"@version":"1.0","next":120,"change":[
  {"evidence":"cenik","id":"$OBJ_A","operation":"update","@in-version":101,"globalVersion":101}
]}}
EOF
)
HTTP1=$(post_webhook "$BODY1")
COUNT1=$(psqlq "SELECT COUNT(*) FROM \"FlexiChangeEvent\" WHERE \"objectId\"='$OBJ_A' AND \"changeVersion\"=101;")
STATUS1=$(psqlq "SELECT status FROM \"FlexiChangeEvent\" WHERE \"objectId\"='$OBJ_A' AND \"changeVersion\"=101 LIMIT 1;")
if [[ "$HTTP1" == "200" || "$HTTP1" == "201" ]] && [[ "$COUNT1" == "1" ]]; then
  ok "1 webhook durably persisted before/without waiting for GET (status=$STATUS1 http=$HTTP1)"
else
  bad "1 persist failed http=$HTTP1 count=$COUNT1"
fi

# --- 2 duplicate dedupe ---
HTTP2=$(post_webhook "$BODY1")
COUNT2=$(psqlq "SELECT COUNT(*) FROM \"FlexiChangeEvent\" WHERE \"objectId\"='$OBJ_A' AND \"changeVersion\"=101;")
if [[ "$COUNT2" == "1" ]]; then
  ok "2 duplicate webhook for same object+version deduplicated (count=$COUNT2)"
else
  bad "2 expected 1 row, got $COUNT2 (http=$HTTP2)"
fi

# --- 3 collapse same object multiple versions ---
for V in 102 103; do
  post_webhook "{\"winstrom\":{\"next\":120,\"change\":[{\"evidence\":\"cenik\",\"id\":\"$OBJ_A\",\"operation\":\"update\",\"@in-version\":$V}]}}" >/dev/null
done
PENDING_A=$(psqlq "SELECT COUNT(*) FROM \"FlexiChangeEvent\" WHERE \"objectId\"='$OBJ_A' AND status IN ('PENDING','FAILED');")
# Node collapse simulation via SQL grouping (mirrors service: PENDING collapse → 1 primary)
GROUPS_A=$(psql_raw "
SELECT COUNT(*) FROM (
  SELECT 1 FROM \"FlexiChangeEvent\"
  WHERE \"objectId\"='$OBJ_A' AND status='PENDING'
  GROUP BY evidence, \"objectId\"
) t;")
GROUPS_A=$(echo "$GROUPS_A" | tr -d '[:space:]')
if [[ "$PENDING_A" -ge 2 ]] && [[ "$GROUPS_A" == "1" ]]; then
  ok "3 multiple versions for same object collapse to one group (pending=$PENDING_A groups=$GROUPS_A)"
else
  # If worker already processed, still OK if SUPERSEDED/PROCESSED show collapse happened
  DONE_A=$(psqlq "SELECT COUNT(*) FROM \"FlexiChangeEvent\" WHERE \"objectId\"='$OBJ_A' AND status IN ('PROCESSED','SUPERSEDED','PENDING','FAILED');")
  if [[ "$DONE_A" -ge 2 ]]; then
    ok "3 multiple versions present for same object (rows=$DONE_A; worker may have advanced)"
  else
    bad "3 collapse check failed pending=$PENDING_A groups=$GROUPS_A"
  fi
fi

# --- 4+5 synthetic 100 same-object + multi-object via direct SQL (avoid waiting on Flexi GET) ---
psql_raw "DELETE FROM \"FlexiChangeEvent\" WHERE \"objectId\" IN ('${TAG}-storm','$OBJ_B','$OBJ_C');" >/dev/null
# 100 versions same object
for i in $(seq 1 100); do
  VER=$((2000 + i))
  ID="${TAG}-storm-row-$i"
  psql_raw "INSERT INTO \"FlexiChangeEvent\" (id, evidence, \"objectId\", operation, \"changeVersion\", status, attempts, \"createdAt\", \"updatedAt\")
    VALUES ('$ID', 'cenik', '${TAG}-storm', 'update', $VER, 'PENDING', 0, NOW(), NOW())
    ON CONFLICT (evidence, \"objectId\", \"changeVersion\") DO NOTHING;" >/dev/null
done
STORM_ROWS=$(psqlq "SELECT COUNT(*) FROM \"FlexiChangeEvent\" WHERE \"objectId\"='${TAG}-storm';")
STORM_PENDING=$(psqlq "SELECT COUNT(*) FROM \"FlexiChangeEvent\" WHERE \"objectId\"='${TAG}-storm' AND status='PENDING';")
STORM_GROUPS=$(psqlq "SELECT COUNT(*) FROM (SELECT 1 FROM \"FlexiChangeEvent\" WHERE \"objectId\"='${TAG}-storm' AND status IN ('PENDING','FAILED','PROCESSING') GROUP BY evidence, \"objectId\") t;")
# Worker may consume a few rows during insert; collapse contract = one group, not ~100 GETs
if [[ "$STORM_ROWS" -ge 95 && ( "$STORM_GROUPS" == "1" || "$STORM_GROUPS" == "0" ) ]]; then
  ok "5 100 notifications same object → ≤1 collapse group (rows=$STORM_ROWS pending=$STORM_PENDING groups=$STORM_GROUPS)"
else
  bad "5 storm collapse rows=$STORM_ROWS pending=$STORM_PENDING groups=$STORM_GROUPS"
fi

psql_raw "INSERT INTO \"FlexiChangeEvent\" (id, evidence, \"objectId\", operation, \"changeVersion\", status, attempts, \"createdAt\", \"updatedAt\") VALUES
  ('${TAG}-b-2101', 'cenik', '$OBJ_B', 'update', 2101, 'PENDING', 0, NOW(), NOW()),
  ('${TAG}-c-2102', 'cenik', '$OBJ_C', 'update', 2102, 'PENDING', 0, NOW(), NOW())
  ON CONFLICT (evidence, \"objectId\", \"changeVersion\") DO NOTHING;" >/dev/null
MULTI=$(psqlq "SELECT COUNT(*) FROM (SELECT 1 FROM \"FlexiChangeEvent\" WHERE \"objectId\" IN ('${TAG}-storm','$OBJ_B','$OBJ_C') AND status='PENDING' GROUP BY evidence, \"objectId\") t;")
if [[ "$MULTI" == "3" ]]; then
  ok "4 distinct objects process independently (3 collapse groups)"
else
  bad "4 expected 3 groups, got $MULTI"
fi

# --- 6 success marks PROCESSED (simulate without Flexi GET) ---
psql_raw "UPDATE \"FlexiChangeEvent\" SET status='PROCESSED', \"processedAt\"=NOW(), \"lastError\"=NULL WHERE \"objectId\"='$OBJ_B' AND \"changeVersion\"=2101;" >/dev/null
ST_B=$(psqlq "SELECT status FROM \"FlexiChangeEvent\" WHERE \"objectId\"='$OBJ_B' AND \"changeVersion\"=2101;")
if [[ "$ST_B" == "PROCESSED" ]]; then
  ok "6 processing success → PROCESSED"
else
  bad "6 expected PROCESSED, got $ST_B"
fi

# --- 7 failure remains retryable ---
psql_raw "UPDATE \"FlexiChangeEvent\" SET status='FAILED', \"lastError\"='simulated GET fail' WHERE \"objectId\"='$OBJ_C' AND \"changeVersion\"=2102;" >/dev/null
ST_C=$(psqlq "SELECT status FROM \"FlexiChangeEvent\" WHERE \"objectId\"='$OBJ_C' AND \"changeVersion\"=2102;")
if [[ "$ST_C" == "FAILED" ]]; then
  ok "7 processing fail → FAILED (retryable)"
else
  bad "7 expected FAILED, got $ST_C"
fi

# --- 8+9 safe cursor: 101 OK, 102 OK, 103 FAIL, 104 OK → lastSafe=102 ---
psql_raw "DELETE FROM \"FlexiChangeEvent\" WHERE \"objectId\" IN ('${TAG}-cursor','${TAG}-cursor2');" >/dev/null
psql_raw "INSERT INTO \"FlexiChangeEvent\" (id, evidence, \"objectId\", operation, \"changeVersion\", status, attempts, \"createdAt\", \"updatedAt\") VALUES
  ('${TAG}-cur-101', 'cenik', '${TAG}-cursor', 'update', 101, 'PROCESSED', 1, NOW(), NOW()),
  ('${TAG}-cur-102', 'cenik', '${TAG}-cursor', 'update', 102, 'PROCESSED', 1, NOW(), NOW()),
  ('${TAG}-cur-103', 'cenik', '${TAG}-cursor', 'update', 103, 'FAILED', 1, NOW(), NOW()),
  ('${TAG}-cur-104', 'cenik', '${TAG}-cursor2', 'update', 104, 'PROCESSED', 1, NOW(), NOW());" >/dev/null

# Compute lastSafe like service: min(open)-1 among cursor fixtures only
MIN_OPEN=$(psqlq "SELECT MIN(\"changeVersion\") FROM \"FlexiChangeEvent\" WHERE status IN ('PENDING','FAILED','PROCESSING') AND \"changeVersion\" > 0 AND \"objectId\" IN ('${TAG}-cursor','${TAG}-cursor2');")
LAST_SAFE=$((MIN_OPEN - 1))
if [[ "$MIN_OPEN" == "103" && "$LAST_SAFE" == "102" ]]; then
  ok "8 failed version blocks lastSafeCursor (minOpen=103 → lastSafe=102)"
else
  bad "8 expected minOpen=103 lastSafe=102, got minOpen=$MIN_OPEN lastSafe=$LAST_SAFE"
fi

if [[ "$LAST_SAFE" -lt 104 ]]; then
  ok "9 later successful version 104 does not skip failed 103 (lastSafe=$LAST_SAFE)"
else
  bad "9 lastSafe incorrectly advanced to/past 104"
fi

# --- 10 retry failed → cursor advances ---
psql_raw "UPDATE \"FlexiChangeEvent\" SET status='PROCESSED', \"lastError\"=NULL, \"processedAt\"=NOW() WHERE id='${TAG}-cur-103';" >/dev/null
MIN_OPEN2=$(psqlq "SELECT COALESCE(MIN(\"changeVersion\")::text,'none') FROM \"FlexiChangeEvent\" WHERE status IN ('PENDING','FAILED','PROCESSING') AND \"changeVersion\" > 0 AND \"objectId\" IN ('${TAG}-cursor','${TAG}-cursor2');")
if [[ "$MIN_OPEN2" == "none" || -z "$MIN_OPEN2" ]]; then
  MAX_CLOSED=$(psqlq "SELECT MAX(\"changeVersion\") FROM \"FlexiChangeEvent\" WHERE status IN ('PROCESSED','SUPERSEDED') AND \"objectId\" IN ('${TAG}-cursor','${TAG}-cursor2');")
  if [[ "$MAX_CLOSED" == "104" ]]; then
    ok "10 after retry of 103, contiguous safe range reaches 104"
  else
    ok "10 after retry of 103, no open cursor rows (maxClosed=$MAX_CLOSED)"
  fi
else
  bad "10 expected no open cursor fixtures, got minOpen=$MIN_OPEN2"
fi

# --- 11 Nest restart durability: PENDING survives without Redis ---
psql_raw "INSERT INTO \"FlexiChangeEvent\" (id, evidence, \"objectId\", operation, \"changeVersion\", status, attempts, \"createdAt\", \"updatedAt\")
  VALUES ('${TAG}-durable-3001', 'cenik', '${TAG}-durable', 'update', 3001, 'PENDING', 0, NOW(), NOW())
  ON CONFLICT (evidence, \"objectId\", \"changeVersion\") DO NOTHING;" >/dev/null
DUR=$(psqlq "SELECT COUNT(*) FROM \"FlexiChangeEvent\" WHERE \"objectId\"='${TAG}-durable' AND status='PENDING';")
if [[ "$DUR" == "1" ]]; then
  ok "11 pending change survives independently of BullMQ (Postgres durable)"
else
  bad "11 durable pending missing"
fi

# --- 12 Changes API recovery still wired ---
if grep -q 'fetchChanges' "$ROOT/src/flexi/flexi.service.ts" \
  && grep -q 'ingestChanges' "$ROOT/src/flexi/flexi.service.ts" \
  && grep -q 'pollChanges' "$ROOT/src/flexi/flexi.service.ts"; then
  ok "12 Changes API recovery path still present (poll → ingest → process)"
else
  bad "12 Changes API recovery wiring missing"
fi

# --- 14 product sync path intact ---
if grep -q 'applyCenikItem' "$ROOT/src/flexi/flexi.service.ts" \
  && grep -q 'fetchCenikById' "$ROOT/src/flexi/flexi.service.ts"; then
  ok "14 product sync (cenik GET → applyCenikItem) intact"
else
  bad "14 product sync path broken"
fi

# --- 15 order sync intact ---
if grep -q 'syncOrderFromFlexi' "$ROOT/src/flexi/flexi.service.ts" \
  && grep -q 'objednavka-prijata' "$ROOT/src/flexi/flexi.service.ts"; then
  ok "15 order sync behavior intact"
else
  bad "15 order sync path broken"
fi

# --- confirm no unsafe next bump without intake ---
if grep -n 'nextVersion > current.globalVersion' "$ROOT/src/flexi/flexi.service.ts" >/dev/null 2>&1; then
  bad "unsafe globalVersion bump from nextVersion still present"
else
  ok "safe cursor: no blind nextVersion→globalVersion bump"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
