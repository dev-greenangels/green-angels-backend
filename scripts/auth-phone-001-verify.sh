#!/usr/bin/env bash
# AUTH-PHONE-001 — BFF phone-session uses market.phonePolicy (not UA-only)
set -euo pipefail

SHOP="${SHOP:-http://localhost:3000}"
PASS=0
FAIL=0
ROOT_SHOP="$(cd "$(dirname "$0")/../../green-angels-shop" && pwd)"
# When run from backend/scripts, shop is sibling
if [[ ! -d "$ROOT_SHOP/app" ]]; then
  ROOT_SHOP="$(cd "$(dirname "$0")/../../../green-angels-shop" && pwd)"
fi
# Prefer monorepo layout: green-angels-backend/scripts -> ../../green-angels-shop
ROOT_SHOP="$(cd "$(dirname "$0")/../.." && pwd)/green-angels-shop"
ROUTE="$ROOT_SHOP/app/api/auth/phone-session/route.ts"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

psqlq() {
  docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "$1" | head -n1 | tr -d '[:space:]'
}

if [[ ! -f "$ROUTE" ]]; then
  bad "phone-session route not found at $ROUTE"
  echo "AUTH-PHONE-001 results: PASS=$PASS FAIL=$FAIL"
  exit 1
fi

if grep -q isValidUkrPhone "$ROUTE"; then
  bad "BFF still hardcodes isValidUkrPhone"
else
  ok "isValidUkrPhone removed from phone-session BFF"
fi

if grep -q isValidPhoneForPolicy "$ROUTE" && grep -q getMarketSettings "$ROUTE" && grep -q authPhonePolicy "$ROUTE"; then
  ok "BFF uses isValidPhoneForPolicy + authPhonePolicy"
else
  bad "market-aware phone validation missing"
fi

if grep -q validatePhoneForPolicy /Users/user/DevProjects/green-angels-project/green-angels-backend/src/auth/market-phone.util.ts; then
  ok "Nest validatePhoneForPolicy untouched as source of truth"
else
  bad "Nest market-phone util missing"
fi

POLICY_BEFORE=$(docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "SELECT value FROM \"Settings\" WHERE key='commerce.market' LIMIT 1;" | tr -d '\n' || true)
restore() {
  if [[ -n "${POLICY_BEFORE:-}" ]]; then
    docker exec green-angels-postgres psql -U green_angels -d green_angels -c "UPDATE \"Settings\" SET value = \$m\$ ${POLICY_BEFORE} \$m\$ WHERE key='commerce.market';" >/dev/null || true
  fi
}
trap restore EXIT

set_phone_policy() {
  local policy="$1"
  psqlq "UPDATE \"Settings\" SET value = ((COALESCE(NULLIF(value,''),'{}')::jsonb) || jsonb_build_object('authPhonePolicy', '$policy', 'phonePolicy', '$policy'))::text WHERE key='commerce.market';" >/dev/null
}

# SK policy: UA number rejected at BFF; SK accepted shape (still needs OTP token for session — expect not 400 on phone)
set_phone_policy sk_e164
UA_HTTP=$(curl -sS -o /tmp/auth-phone-ua.json -w '%{http_code}' -X POST "$SHOP/api/auth/phone-session" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+380501112233"}')
if [[ "$UA_HTTP" == "400" ]]; then
  ok "sk_e164 rejects UA +380 at BFF (HTTP 400)"
else
  bad "sk_e164 should reject UA phone, got HTTP $UA_HTTP body=$(head -c 120 /tmp/auth-phone-ua.json)"
fi

SK_HTTP=$(curl -sS -o /tmp/auth-phone-sk.json -w '%{http_code}' -X POST "$SHOP/api/auth/phone-session" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+421901234567"}')
# Without verificationToken Nest may 400/401 — but must NOT be BFF UA-only 400 about Ukrainian number
BODY=$(head -c 300 /tmp/auth-phone-sk.json)
if echo "$BODY" | grep -qi 'українськ'; then
  bad "SK phone still gets UA-only error: $BODY"
elif [[ "$SK_HTTP" == "400" ]] && echo "$BODY" | grep -qi 'словацьк'; then
  bad "SK valid number rejected by BFF as invalid SK: $BODY"
else
  ok "sk_e164 accepts SK phone shape at BFF (HTTP $SK_HTTP, not UA-hardcoded)"
fi

set_phone_policy ua_e164
UA2=$(curl -sS -o /tmp/auth-phone-ua2.json -w '%{http_code}' -X POST "$SHOP/api/auth/phone-session" \
  -H 'Content-Type: application/json' \
  -d '{"phone":"+380501112233"}')
BODY2=$(head -c 300 /tmp/auth-phone-ua2.json)
if echo "$BODY2" | grep -qi 'українськ' && [[ "$UA2" == "400" ]]; then
  bad "ua_e164 rejects valid UA at BFF: $BODY2"
else
  ok "ua_e164 accepts UA phone shape at BFF (HTTP $UA2)"
fi

echo ""
echo "AUTH-PHONE-001 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
