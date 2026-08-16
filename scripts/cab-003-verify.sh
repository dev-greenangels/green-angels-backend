#!/usr/bin/env bash
# CAB-003 — customer order detail with ownership (IDOR → 404)
set -euo pipefail

API="${API:-http://localhost:3001}"
PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHOP="$(cd "$ROOT/.." && pwd)/green-angels-shop"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

psqlq() {
  docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "$1" | head -n1 | tr -d '[:space:]'
}

if grep -q getOrderDetail "$ROOT/src/account/account.service.ts" && \
   grep -q "where: { id, userId }" "$ROOT/src/account/account.service.ts"; then
  ok "getOrderDetail filters by id + userId"
else
  bad "ownership filter missing in getOrderDetail"
fi

if grep -q "Get('orders/:id')" "$ROOT/src/account/account.controller.ts"; then
  ok "Nest GET /account/orders/:id registered"
else
  bad "Nest route missing"
fi

if [[ -f "$SHOP/app/api/account/orders/[id]/route.ts" ]] && \
   grep -q requireCustomerSession "$SHOP/app/api/account/orders/[id]/route.ts" && \
   grep -q fetchAccountOrder "$SHOP/lib/account/api.ts"; then
  ok "BFF + lib fetchAccountOrder present"
else
  bad "shop BFF/lib incomplete"
fi

# Must not weaken backstage GET /orders/:id
if grep -q BackstageJwtAuthGuard "$ROOT/src/orders/orders.controller.ts" && \
   grep -A3 "Get(':id')" "$ROOT/src/orders/orders.controller.ts" | grep -q BackstageJwtAuthGuard; then
  ok "backstage GET /orders/:id auth unchanged"
else
  bad "backstage order GET guard check failed"
fi

ROW=$(docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c \
  "SELECT o.id || '|' || o.\"userId\" FROM \"Order\" o WHERE o.\"userId\" IS NOT NULL ORDER BY o.\"createdAt\" DESC LIMIT 1;")
OTHER=$(psqlq "SELECT id FROM \"User\" WHERE role='USER' AND id <> (SELECT \"userId\" FROM \"Order\" WHERE \"userId\" IS NOT NULL ORDER BY \"createdAt\" DESC LIMIT 1) ORDER BY \"createdAt\" ASC LIMIT 1;")

if [[ -z "$ROW" || "$ROW" != *"|"* ]]; then
  echo "No user-owned order — static checks only"
  echo "CAB-003 results: PASS=$PASS FAIL=$FAIL"
  [[ "$FAIL" -gt 0 ]] && exit 1
  exit 0
fi

OID=$(printf '%s' "$ROW" | cut -d'|' -f1)
OWNER=$(printf '%s' "$ROW" | cut -d'|' -f2)

OWNER_JWT=$(docker exec green-angels-api node -e "
const jwt=require('jsonwebtoken');
process.stdout.write(jwt.sign({role:'customer',v:1},process.env.JWT_SECRET,{subject:process.argv[1],expiresIn:'1h'}));
" "$OWNER")

HTTP_OWN=$(curl -sS -o /tmp/cab003-own.json -w '%{http_code}' \
  -H "Authorization: Bearer $OWNER_JWT" \
  "$API/account/orders/$OID")
if [[ "$HTTP_OWN" == "200" ]]; then
  HAS_ITEMS=$(node -e "const d=require('/tmp/cab003-own.json'); process.stdout.write(Array.isArray(d.items)?'1':'0')")
  if [[ "$HAS_ITEMS" == "1" ]]; then
    ok "owner GET detail → 200 with items"
  else
    bad "owner 200 but items missing"
  fi
else
  bad "owner expected 200, got $HTTP_OWN body=$(head -c 120 /tmp/cab003-own.json)"
fi

HTTP_NONE=$(curl -sS -o /tmp/cab003-none.json -w '%{http_code}' "$API/account/orders/$OID")
if [[ "$HTTP_NONE" == "401" ]]; then
  ok "unauthenticated → 401"
else
  bad "unauth expected 401, got $HTTP_NONE"
fi

if [[ -n "$OTHER" ]]; then
  OTHER_JWT=$(docker exec green-angels-api node -e "
const jwt=require('jsonwebtoken');
process.stdout.write(jwt.sign({role:'customer',v:1},process.env.JWT_SECRET,{subject:process.argv[1],expiresIn:'1h'}));
" "$OTHER")
  HTTP_IDOR=$(curl -sS -o /tmp/cab003-idor.json -w '%{http_code}' \
    -H "Authorization: Bearer $OTHER_JWT" \
    "$API/account/orders/$OID")
  if [[ "$HTTP_IDOR" == "404" ]]; then
    ok "IDOR (other user) → 404"
  else
    bad "IDOR expected 404, got $HTTP_IDOR"
  fi
else
  # fabricate stranger uuid
  STRANGER_JWT=$(docker exec green-angels-api node -e "
const jwt=require('jsonwebtoken');
process.stdout.write(jwt.sign({role:'customer',v:1},process.env.JWT_SECRET,{subject:'00000000-0000-4000-8000-000000000099',expiresIn:'1h'}));
")
  HTTP_IDOR=$(curl -sS -o /tmp/cab003-idor.json -w '%{http_code}' \
    -H "Authorization: Bearer $STRANGER_JWT" \
    "$API/account/orders/$OID")
  if [[ "$HTTP_IDOR" == "404" ]]; then
    ok "IDOR (stranger session) → 404"
  else
    bad "IDOR expected 404, got $HTTP_IDOR"
  fi
fi

HTTP_MISS=$(curl -sS -o /tmp/cab003-miss.json -w '%{http_code}' \
  -H "Authorization: Bearer $OWNER_JWT" \
  "$API/account/orders/00000000-0000-4000-8000-000000000001")
if [[ "$HTTP_MISS" == "404" ]]; then
  ok "missing id → 404"
else
  bad "missing expected 404, got $HTTP_MISS"
fi

echo ""
echo "CAB-003 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
