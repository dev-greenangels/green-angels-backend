#!/usr/bin/env bash
# CAB-014 — customer cabinet mobile layout polish
set -euo pipefail

PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHOP="$ROOT/green-angels-shop"
ACCOUNT="$SHOP/components/account"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

if [[ -f "$ACCOUNT/account-list-pagination.tsx" ]]; then
  ok "account-list-pagination.tsx exists"
else
  bad "account-list-pagination.tsx missing"
fi

for f in account-orders-content.tsx account-reviews-content.tsx account-notifications-content.tsx; do
  if grep -q 'AccountListPagination' "$ACCOUNT/$f" 2>/dev/null; then
    ok "$f uses shared mobile pagination"
  else
    bad "$f missing AccountListPagination"
  fi
done

if grep -q 'min-h-11' "$ACCOUNT/account-nav.tsx" 2>/dev/null; then
  ok "account nav touch targets (min-h-11)"
else
  bad "account nav missing min-h-11 touch targets"
fi

if grep -q 'site-shell-padding-x' "$ACCOUNT/account-shell.tsx" 2>/dev/null; then
  ok "account shell mobile nav scroll padding"
else
  bad "account shell missing mobile nav scroll padding"
fi

if grep -q 'p-6 text-center sm:p-10' "$ACCOUNT/account-page-state.tsx" 2>/dev/null; then
  ok "empty state responsive padding"
else
  bad "empty state missing responsive padding"
fi

if grep -q 'break-words' "$ACCOUNT/account-order-detail-content.tsx" 2>/dev/null; then
  ok "order detail word breaking"
else
  bad "order detail missing break-words"
fi

if grep -q 'break-all' "$ACCOUNT/account-orders-content.tsx" 2>/dev/null; then
  ok "order list tracking break-all"
else
  bad "order list missing tracking break-all"
fi

if grep -q '90dvh' "$ACCOUNT/account-privacy-section.tsx" 2>/dev/null; then
  ok "privacy dialog Safari-safe max height"
else
  bad "privacy dialog missing 90dvh max height"
fi

echo ""
echo "CAB-014 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
