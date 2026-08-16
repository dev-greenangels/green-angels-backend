#!/usr/bin/env bash
# CAB-013 — shared cabinet loading/empty/error states
set -euo pipefail

PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHOP="$ROOT/green-angels-shop"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

STATE="$SHOP/components/account/account-page-state.tsx"
if [[ -f "$STATE" ]]; then
  ok "account-page-state.tsx exists"
else
  bad "account-page-state.tsx missing"
fi

for f in \
  account-dashboard-content.tsx \
  account-orders-content.tsx \
  account-order-detail-content.tsx \
  account-reviews-content.tsx \
  account-notifications-content.tsx \
  account-referrals-content.tsx \
  account-settings-content.tsx; do
  if grep -q 'account-page-state' "$SHOP/components/account/$f" 2>/dev/null; then
    ok "$f uses shared page states"
  else
    bad "$f missing account-page-state import"
  fi
done

if grep -q 'account-page-state' "$SHOP/components/favorites/favorites-page-content.tsx" 2>/dev/null; then
  ok "favorites-page-content uses shared page states"
else
  bad "favorites-page-content missing account-page-state"
fi

if grep -q 'AccountPageError' "$SHOP/components/account/account-settings-content.tsx" && \
   grep -q 'loadError' "$SHOP/components/account/account-settings-content.tsx"; then
  ok "settings shows error state (not toast-only on load fail)"
else
  bad "settings load error UX incomplete"
fi

echo ""
echo "CAB-013 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
