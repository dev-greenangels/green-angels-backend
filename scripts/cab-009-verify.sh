#!/usr/bin/env bash
# CAB-009 — split authPhonePolicy / deliveryPhonePolicy + account settings UX
set -euo pipefail

PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/green-angels-backend"
SHOP="$ROOT/green-angels-shop"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

NEST_TYPES="$BACKEND/src/settings/market.types.ts"
SHOP_TYPES="$SHOP/lib/settings/market.ts"

if grep -q authPhonePolicy "$NEST_TYPES" && grep -q deliveryPhonePolicy "$NEST_TYPES" && \
   grep -q "defaultAuthPhonePolicy" "$NEST_TYPES" && grep -q "defaultDeliveryPhonePolicy" "$NEST_TYPES"; then
  ok "Nest market types split + defaults helpers"
else
  bad "Nest market types incomplete"
fi

if grep -q authPhonePolicy "$SHOP_TYPES" && grep -q deliveryPhonePolicy "$SHOP_TYPES"; then
  ok "Shop market types split"
else
  bad "Shop market types incomplete"
fi

# Defaults: UA auth intl + delivery ua; SK delivery intl
node --input-type=module <<'EOF' || exit 1
function defaultAuth() { return 'intl' }
function defaultDelivery(region) { return region === 'sk' ? 'intl' : 'ua_e164' }
const cases = [
  [defaultAuth('ua') === 'intl', 'UA auth intl'],
  [defaultDelivery('ua') === 'ua_e164', 'UA delivery ua'],
  [defaultAuth('sk') === 'intl', 'SK auth intl'],
  [defaultDelivery('sk') === 'intl', 'SK delivery intl'],
]
let fail = 0
for (const [ok, name] of cases) {
  if (!ok) { console.error('FAIL', name); fail++ }
  else console.log('PASS smoke:', name)
}
process.exit(fail ? 1 : 0)
EOF
ok "default policy smoke"

if grep -q 'market.authPhonePolicy' "$BACKEND/src/auth/auth.service.ts" && \
   grep -q 'market.authPhonePolicy' "$BACKEND/src/account/account.service.ts"; then
  ok "Nest auth/account use authPhonePolicy"
else
  bad "Nest auth/account still on phonePolicy"
fi

if grep -q 'authPhonePolicy' "$BACKEND/src/orders/orders.service.ts" && \
   grep -q 'deliveryPhonePolicy' "$BACKEND/src/orders/orders.service.ts"; then
  ok "Nest orders: customer=auth, receiver=delivery"
else
  bad "Nest orders policies not split"
fi

if grep -q 'market.authPhonePolicy' "$SHOP/app/api/auth/phone-session/route.ts"; then
  ok "BFF phone-session uses authPhonePolicy"
else
  bad "BFF still on phonePolicy"
fi

if grep -q 'authPhonePolicy' "$SHOP/components/auth/auth-phone-flow.tsx" && \
   grep -q 'authPhonePolicy' "$SHOP/components/account/account-settings-content.tsx"; then
  ok "Auth + account settings use authPhonePolicy"
else
  bad "Auth/settings UI missing authPhonePolicy"
fi

if grep -q 'authPhonePolicy' "$SHOP/components/backstage/market-settings-form.tsx" && \
   grep -q 'deliveryPhonePolicy' "$SHOP/components/backstage/market-settings-form.tsx"; then
  ok "Backstage Market has two phone selects"
else
  bad "Backstage Market form incomplete"
fi

if grep -q 'deliveryPhonePolicy' "$SHOP/components/checkout/checkout-delivery-fields.tsx"; then
  ok "Checkout delivery fields use deliveryPhonePolicy"
else
  bad "Checkout delivery fields missing policy"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
