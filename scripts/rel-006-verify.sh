#!/usr/bin/env bash
# REL-006 — paginate backstage orders (capped pageSize; never unbounded)
set -euo pipefail

API="${API:-http://localhost:3001}"
PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

psqlq() {
  docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "$1" | head -n1 | tr -d '[:space:]'
}

json_get() {
  node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); const p='$1'.split('.'); let v=d; for (const k of p){ if(v==null){process.exit(2)}; v=v[k]; } if(v===undefined||v===null) process.exit(2); process.stdout.write(String(v));"
}

if grep -q BACKSTAGE_ORDERS_MAX_PAGE_SIZE "$ROOT/src/orders/orders.service.ts" && \
   grep -q 'skip,' "$ROOT/src/orders/orders.service.ts" && \
   grep -q 'take: pageSize' "$ROOT/src/orders/orders.service.ts"; then
  ok "findAll uses capped pageSize + skip/take"
else
  bad "findAll pagination wiring missing"
fi

if grep -q "@@index(\\[createdAt\\])" "$ROOT/prisma/schema.prisma" || \
   grep -q '@@index([createdAt])' "$ROOT/prisma/schema.prisma"; then
  ok "Order.createdAt index in schema"
else
  bad "Order.createdAt index missing"
fi

if grep -q "@@index(\\[status, createdAt\\])" "$ROOT/prisma/schema.prisma" || \
   grep -q '@@index([status, createdAt])' "$ROOT/prisma/schema.prisma"; then
  ok "Order status+createdAt composite index in schema"
else
  bad "Order status+createdAt index missing"
fi

if grep -q findSummary "$ROOT/src/orders/orders.service.ts" && \
   grep -q "Get('summary')" "$ROOT/src/orders/orders.controller.ts"; then
  ok "orders summary endpoint present (dashboard without row dump)"
else
  bad "orders summary endpoint missing"
fi

IDX=$(psqlq "SELECT COUNT(*)::text FROM pg_indexes WHERE tablename='Order' AND indexname IN ('Order_createdAt_idx','Order_status_createdAt_idx')")
if [[ "$IDX" == "2" ]]; then
  ok "list indexes exist in DB"
else
  bad "list indexes missing in DB (got=$IDX) — run migrate"
fi

ADMIN_ID=$(psqlq "SELECT id FROM \"User\" WHERE role IN ('ADMIN','MANAGER') ORDER BY \"createdAt\" ASC LIMIT 1;")
if [[ -z "$ADMIN_ID" ]]; then
  bad "no admin for HTTP checks"
  echo "REL-006 results: PASS=$PASS FAIL=$FAIL"
  exit 1
fi

ADMIN_JWT=$(docker exec green-angels-api node -e "
const jwt=require('jsonwebtoken');
const secret=process.env.JWT_SECRET;
process.stdout.write(jwt.sign({ role: 'admin', v: 1 }, secret, { subject: process.argv[1], expiresIn: '1h' }));
" "$ADMIN_ID")

HTTP=$(curl -sS -o /tmp/rel006-page.json -w '%{http_code}' \
  -H "Authorization: Bearer $ADMIN_JWT" \
  "$API/orders?page=1&pageSize=9999")
if [[ "$HTTP" == "200" ]]; then
  PS=$(json_get pageSize </tmp/rel006-page.json)
  ITEMS=$(node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/rel006-page.json','utf8')); process.stdout.write(String(Array.isArray(d.items)?d.items.length:-1));")
  if [[ "$PS" -le 100 && "$ITEMS" -le "$PS" ]]; then
    ok "pageSize=9999 capped (pageSize=$PS items=$ITEMS)"
  else
    bad "pageSize not capped (pageSize=$PS items=$ITEMS)"
  fi
  for key in items total page pageSize totalPages; do
    if node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/rel006-page.json','utf8')); if(!( '$key' in d)) process.exit(1)"; then
      :
    else
      bad "list response missing $key"
    fi
  done
  ok "list envelope has items/total/page/pageSize/totalPages"
else
  bad "GET /orders HTTP $HTTP"
fi

SUM_HTTP=$(curl -sS -o /tmp/rel006-sum.json -w '%{http_code}' \
  -H "Authorization: Bearer $ADMIN_JWT" \
  "$API/orders/summary")
if [[ "$SUM_HTTP" == "200" ]]; then
  TO=$(json_get totalOrders </tmp/rel006-sum.json)
  TR=$(json_get totalRevenue </tmp/rel006-sum.json)
  ok "GET /orders/summary → totalOrders=$TO totalRevenue=$TR"
else
  bad "GET /orders/summary HTTP $SUM_HTTP"
fi

echo ""
echo "REL-006 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
