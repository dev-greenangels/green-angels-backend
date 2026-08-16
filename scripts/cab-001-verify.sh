#!/usr/bin/env bash
# CAB-001 — backstage dashboard loading/empty/error states
set -euo pipefail

PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHOP="$ROOT/green-angels-shop"
DASH="$SHOP/components/backstage/dashboard-overview.tsx"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

if [[ -f "$DASH" ]]; then
  ok "dashboard-overview.tsx exists"
else
  bad "dashboard-overview.tsx missing"
fi

if grep -q 'account-page-state' "$DASH" 2>/dev/null; then
  ok "dashboard reuses account-page-state components"
else
  bad "dashboard missing account-page-state import"
fi

if grep -q 'AccountPageLoading' "$DASH" && grep -q 'AccountPageError' "$DASH" && grep -q 'AccountPageEmpty' "$DASH"; then
  ok "dashboard uses loading/error/empty states"
else
  bad "dashboard missing loading/error/empty components"
fi

if ! grep -q "setProductCount('—')" "$DASH" 2>/dev/null && ! grep -q 'setProductCount("—")' "$DASH" 2>/dev/null; then
  ok "no silent catch -> em dash for product count"
else
  bad "dashboard still uses em dash fallback on product error"
fi

if ! grep -q '\.catch(() => {' "$DASH" 2>/dev/null; then
  ok "no empty catch blocks swallowing errors"
else
  bad "dashboard still has silent catch blocks"
fi

if grep -q 'loadProducts' "$DASH" && grep -q 'loadOrders' "$DASH" && grep -q 'onRetry' "$DASH"; then
  ok "dashboard section retry handlers present"
else
  bad "dashboard missing retry handlers"
fi

for loc in uk en sk de hu; do
  FILE="$SHOP/messages/backstage/$loc.json"
  if grep -q '"loadError"' "$FILE" && grep -q '"overview"' "$FILE"; then
    ok "messages/backstage/$loc.json has overview.loadError"
  else
    bad "messages/backstage/$loc.json missing overview.loadError"
  fi
done

echo ""
echo "CAB-001 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
