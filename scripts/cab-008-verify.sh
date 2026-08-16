#!/usr/bin/env bash
# CAB-008 — account stock-notifications pagination (already from REL-007 + UI)
set -euo pipefail

PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHOP="$ROOT/green-angels-shop"
BACKEND="$ROOT/green-angels-backend"
UI="$SHOP/components/account/account-notifications-content.tsx"
SVC="$BACKEND/src/account/account.service.ts"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

if grep -q 'PAGE_SIZE = 20' "$UI" && grep -q fetchAccountStockNotifications "$UI" && grep -q totalPages "$UI"; then
  ok "notifications UI paginated (pageSize 20)"
else
  bad "notifications UI pagination missing"
fi

if grep -q listStockNotificationsPage "$SVC"; then
  ok "Nest listStockNotificationsPage present"
else
  bad "Nest stock notifications page missing"
fi

if grep -q fetchAccountStockNotifications "$SHOP/lib/account/api.ts"; then
  ok "shop lib fetchAccountStockNotifications"
else
  bad "shop lib missing"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
