#!/usr/bin/env bash
# REL-005 — Redis included in Nest /health readiness
set -euo pipefail

API="${API:-http://localhost:3001}"
PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

json_get() {
  node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); const p='$1'.split('.'); let v=d; for (const k of p){ if(v==null){process.exit(2)}; v=v[k]; } if(v===undefined||v===null) process.exit(2); process.stdout.write(String(v));"
}

if grep -q 'redis.client.ping' "$ROOT/src/health/health.controller.ts" && \
   grep -q "redis: 'ok'" "$ROOT/src/health/health.controller.ts" && \
   grep -q ServiceUnavailableException "$ROOT/src/health/health.controller.ts"; then
  ok "health.controller pings Redis and 503s when down"
else
  bad "Redis check missing from health.controller"
fi

if grep -q RedisService "$ROOT/src/health/health.module.ts" || \
   grep -q RedisModule "$ROOT/src/health/health.module.ts" || \
   grep -q RedisService "$ROOT/src/health/health.controller.ts"; then
  ok "HealthController wires RedisService"
else
  bad "RedisService not wired into health"
fi

HTTP=$(curl -sS -o /tmp/rel005-health.json -w '%{http_code}' "$API/health")
if [[ "$HTTP" == "200" ]]; then
  OK=$(json_get ok </tmp/rel005-health.json)
  DB=$(json_get database </tmp/rel005-health.json)
  RD=$(json_get redis </tmp/rel005-health.json)
  if [[ "$OK" == "true" && "$DB" == "ok" && "$RD" == "ok" ]]; then
    ok "GET /health → 200 ok with database+redis"
  else
    bad "GET /health unexpected body=$(cat /tmp/rel005-health.json)"
  fi
else
  bad "GET /health HTTP $HTTP body=$(cat /tmp/rel005-health.json 2>/dev/null | head -c 200)"
fi

# Negative: body must include redis key even on failure path (static)
if grep -q "redis: redisOk ? 'ok' : 'unavailable'" "$ROOT/src/health/health.controller.ts"; then
  ok "503 payload reports redis unavailable distinctly"
else
  bad "503 redis unavailable field missing"
fi

echo ""
echo "REL-005 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
