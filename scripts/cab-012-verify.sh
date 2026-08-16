#!/usr/bin/env bash
# CAB-012 — customer claim-order UI (attachOrphanOrder)
set -euo pipefail

PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHOP="$ROOT/green-angels-shop"
ACCOUNT="$SHOP/components/account"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

CLAIM="$ACCOUNT/account-claim-order-content.tsx"
PAGE="$SHOP/app/[locale]/(account)/account/claim-order/page.tsx"
ATTACH_BFF="$SHOP/app/api/account/orders/[id]/attach/route.ts"
ORDERS="$ACCOUNT/account-orders-content.tsx"

if [[ -f "$CLAIM" ]] && grep -q 'attachOrphanOrder' "$CLAIM"; then
  ok "claim-order content calls attachOrphanOrder"
else
  bad "claim-order content missing attachOrphanOrder"
fi

if grep -q 'account-page-state' "$CLAIM" 2>/dev/null; then
  ok "claim-order uses shared page states"
else
  bad "claim-order missing account-page-state"
fi

if grep -q 'orderId' "$CLAIM" && grep -q 'useSearchParams' "$CLAIM"; then
  ok "claim-order reads orderId query param"
else
  bad "claim-order missing orderId search param"
fi

if ! grep -q 'claimGuestOrder' "$CLAIM" 2>/dev/null; then
  ok "claim-order does not call disabled claimGuestOrder"
else
  bad "claim-order still calls claimGuestOrder"
fi

if grep -q 'Suspense' "$PAGE" && grep -q 'claimOrderTitle' "$PAGE"; then
  ok "claim-order page uses Suspense + claimOrderTitle"
else
  bad "claim-order page incomplete"
fi

if [[ -f "$ATTACH_BFF" ]] && grep -q 'requireCustomerSession' "$ATTACH_BFF"; then
  ok "attach BFF requires customer session"
else
  bad "attach BFF missing requireCustomerSession"
fi

if grep -q '/account/claim-order' "$ORDERS" && grep -q 'claimOrderCta' "$ORDERS"; then
  ok "orders empty state links to claim-order"
else
  bad "orders empty state missing claim-order CTA"
fi

KEYS=(
  claimOrderTitle
  claimOrderIntro
  claimOrderAttachAction
  claimOrderAlreadyInAccount
  claimOrderContactMismatch
  claimOrderVerifyContactsBody
  claimOrderViewOrder
)

for loc in uk en sk hu de cs; do
  FILE="$SHOP/messages/$loc.json"
  missing=0
  for key in "${KEYS[@]}"; do
    if ! grep -q "\"$key\"" "$FILE"; then
      missing=1
      break
    fi
  done
  if [[ "$missing" -eq 0 ]]; then
    ok "messages/$loc.json has claim-order keys"
  else
    bad "messages/$loc.json missing claim-order keys"
  fi
done

echo ""
echo "CAB-012 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
