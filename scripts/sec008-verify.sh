#!/usr/bin/env bash
# SEC-008 / DEC-002 — confirmation: signed token (per orderNumber) OR session ownership
# Guess order number alone → 404 (uniform). Cross-order token → 404.
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

# --- Static: Nest enforces token/owner ---
if grep -q assertValid "$ROOT/src/orders/orders.service.ts" && \
   grep -q 'isOwner' "$ROOT/src/orders/orders.service.ts" && \
   grep -q "Uniform 404" "$ROOT/src/orders/orders.service.ts"; then
  ok "Nest findConfirmation requires owner OR bound token (uniform 404)"
else
  bad "Nest confirmation gate incomplete"
fi

if grep -q "claims.orderNumber !== orderNumber" "$ROOT/src/orders/order-confirmation-token.service.ts"; then
  ok "JWT claims bind token to specific orderNumber"
else
  bad "token not bound to orderNumber"
fi

if grep -q confirmationToken "$ROOT/src/orders/orders.service.ts" && \
   grep -q 'confirmationToken,' "$ROOT/src/orders/orders.service.ts"; then
  ok "create-order response includes confirmationToken"
else
  bad "create-order missing confirmationToken"
fi

# Shop: success URL carries confirmation= ; fetch forwards header
if grep -q 'confirmation=' "$SHOP/app/[locale]/(public)/checkout/page.tsx" && \
   grep -q 'X-Order-Confirmation-Token' "$SHOP/lib/orders/fetch-order-confirmation.ts" && \
   grep -q 'X-Order-Confirmation-Token' "$SHOP/app/api/orders/confirmation/[orderNumber]/route.ts"; then
  ok "checkout success + BFF forward confirmation token"
else
  bad "shop confirmation wiring incomplete"
fi

# Payments embed token in redirect
if grep -q 'confirmation=' "$ROOT/src/payments/payments.service.ts" && \
   grep -q 'confirmation=' "$ROOT/src/monopay/monopay.service.ts"; then
  ok "Stripe/Mono success redirects include confirmation token"
else
  bad "payment redirects missing confirmation query"
fi

# No public open-by-number helper left
if grep -rqE 'findConfirmationByOrderNumber\([^,]+\)\s*$|findConfirmationByOrderNumber\([^,]+\)$' \
  "$ROOT/src" 2>/dev/null; then
  bad "call site may omit auth arg"
else
  ok "no findConfirmation call without auth bag"
fi

ONUM=$(psqlq "SELECT \"orderNumber\" FROM \"Order\" ORDER BY \"createdAt\" DESC LIMIT 1;")
if [[ -z "$ONUM" ]]; then
  echo "No orders in DB — static checks only"
  echo "SEC-008 results: PASS=$PASS FAIL=$FAIL"
  [[ "$FAIL" -gt 0 ]] && exit 1
  exit 0
fi

FMT=$(printf 'ZY-%08d' "$ONUM")

HTTP_NONE=$(curl -sS -o /tmp/sec008-none.json -w '%{http_code}' "$API/orders/confirmation/$FMT")
if [[ "$HTTP_NONE" == "404" ]]; then
  ok "no token/session → 404 ($FMT)"
else
  bad "expected 404 without auth, got $HTTP_NONE"
fi

HTTP_BAD=$(curl -sS -o /tmp/sec008-bad.json -w '%{http_code}' \
  -H 'X-Order-Confirmation-Token: not-a-jwt' \
  "$API/orders/confirmation/$FMT")
if [[ "$HTTP_BAD" == "404" ]]; then
  ok "invalid token → 404 (uniform)"
else
  bad "expected 404 for bad token, got $HTTP_BAD"
fi

TOKENS=$(docker exec green-angels-api node -e "
const jwt=require('jsonwebtoken');
const secret=process.env.JWT_SECRET;
const good=jwt.sign({purpose:'order-confirmation',orderNumber:process.argv[1]},secret,{expiresIn:'1h'});
const other=jwt.sign({purpose:'order-confirmation',orderNumber:process.argv[2]},secret,{expiresIn:'1h'});
process.stdout.write(JSON.stringify({good,other}));
" "$FMT" "ZY-99999999")
GOOD=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).good)" "$TOKENS")
OTHER=$(node -e "process.stdout.write(JSON.parse(process.argv[1]).other)" "$TOKENS")

HTTP_OK=$(curl -sS -o /tmp/sec008-ok.json -w '%{http_code}' \
  -H "X-Order-Confirmation-Token: $GOOD" \
  "$API/orders/confirmation/$FMT")
if [[ "$HTTP_OK" == "200" ]]; then
  ok "matching token → 200"
else
  bad "matching token expected 200, got $HTTP_OK"
fi

HTTP_CROSS=$(curl -sS -o /tmp/sec008-cross.json -w '%{http_code}' \
  -H "X-Order-Confirmation-Token: $OTHER" \
  "$API/orders/confirmation/$FMT")
if [[ "$HTTP_CROSS" == "404" ]]; then
  ok "cross-order token → 404"
else
  bad "cross-order token expected 404, got $HTTP_CROSS"
fi

ROW=$(docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c \
  "SELECT \"orderNumber\" || '|' || \"userId\" FROM \"Order\" WHERE \"userId\" IS NOT NULL ORDER BY \"createdAt\" DESC LIMIT 1;")
if [[ -n "$ROW" && "$ROW" == *"|"* ]]; then
  OWN_ONUM=$(printf '%s' "$ROW" | cut -d'|' -f1)
  OWN_USER=$(printf '%s' "$ROW" | cut -d'|' -f2)
  OWN_FMT=$(printf 'ZY-%08d' "$OWN_ONUM")
  OWN_JWT=$(docker exec green-angels-api node -e "
const jwt=require('jsonwebtoken');
process.stdout.write(jwt.sign({role:'customer',v:1},process.env.JWT_SECRET,{subject:process.argv[1],expiresIn:'1h'}));
" "$OWN_USER")
  HTTP_OWN=$(curl -sS -o /tmp/sec008-own.json -w '%{http_code}' \
    -H "Authorization: Bearer $OWN_JWT" \
    "$API/orders/confirmation/$OWN_FMT")
  if [[ "$HTTP_OWN" == "200" ]]; then
    ok "session ownership (no token) → 200"
  else
    bad "owner session expected 200, got $HTTP_OWN"
  fi
  STRANGER_JWT=$(docker exec green-angels-api node -e "
const jwt=require('jsonwebtoken');
process.stdout.write(jwt.sign({role:'customer',v:1},process.env.JWT_SECRET,{subject:'00000000-0000-4000-8000-000000000099',expiresIn:'1h'}));
")
  HTTP_STRANGER=$(curl -sS -o /tmp/sec008-str.json -w '%{http_code}' \
    -H "Authorization: Bearer $STRANGER_JWT" \
    "$API/orders/confirmation/$OWN_FMT")
  if [[ "$HTTP_STRANGER" == "404" ]]; then
    ok "non-owner session without token → 404"
  else
    bad "non-owner expected 404, got $HTTP_STRANGER"
  fi
else
  echo "SKIP: no user-linked order for ownership probe"
fi

echo ""
echo "SEC-008 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
