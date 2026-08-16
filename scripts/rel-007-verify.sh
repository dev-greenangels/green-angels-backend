#!/usr/bin/env bash
# REL-007 — paginate account lists (orders/reviews/stock-notifications)
set -euo pipefail

PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

psqlq() {
  docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "$1" | head -n1 | tr -d '[:space:]'
}

if grep -q ACCOUNT_LIST_MAX_PAGE_SIZE "$ROOT/src/account/account.service.ts" && \
   grep -q listOrdersPage "$ROOT/src/account/account.service.ts" && \
   grep -q listReviewsPage "$ROOT/src/account/account.service.ts" && \
   grep -q listStockNotificationsPage "$ROOT/src/account/account.service.ts"; then
  ok "account *Page list helpers + capped pageSize"
else
  bad "account pagination helpers missing"
fi

if grep -q 'async listOrders(' "$ROOT/src/account/account.service.ts" || \
   grep -q 'async listReviews(' "$ROOT/src/account/account.service.ts" || \
   grep -q 'async listStockNotifications(' "$ROOT/src/account/account.service.ts"; then
  bad "public unbounded list* methods still present"
else
  ok "unbounded public list* methods removed (export uses private helpers)"
fi

if grep -q loadOrdersForExport "$ROOT/src/account/account.service.ts" && \
   grep -q loadReviewsForExport "$ROOT/src/account/account.service.ts"; then
  ok "GDPR export uses private load*ForExport helpers"
else
  bad "export helpers missing"
fi

if grep -q 'userId, createdAt' "$ROOT/prisma/schema.prisma" && \
   grep -q 'Order_userId_createdAt\|userId, createdAt' "$ROOT/prisma/schema.prisma"; then
  # Count Order + Review indexes mentioning userId, createdAt
  COUNT=$(grep -c 'userId, createdAt' "$ROOT/prisma/schema.prisma" || true)
  if [[ "$COUNT" -ge 2 ]]; then
    ok "Order + Review userId+createdAt indexes in schema"
  else
    bad "expected >=2 userId+createdAt indexes in schema (got=$COUNT)"
  fi
else
  bad "userId+createdAt indexes missing from schema"
fi

# Controller must call *Page variants
if grep -q listOrdersPage "$ROOT/src/account/account.controller.ts" && \
   grep -q listReviewsPage "$ROOT/src/account/account.controller.ts" && \
   grep -q listStockNotificationsPage "$ROOT/src/account/account.controller.ts"; then
  ok "controller routes use paginated methods"
else
  bad "controller not using *Page methods"
fi

IDX=$(psqlq "SELECT COUNT(*)::text FROM pg_indexes WHERE indexname IN ('Order_userId_createdAt_idx','Review_userId_createdAt_idx')")
if [[ "$IDX" == "2" ]]; then
  ok "account list indexes exist in DB"
else
  bad "account list indexes missing in DB (got=$IDX)"
fi

# Shop UI passes pageSize
SHOP="$(cd "$ROOT/.." && pwd)/green-angels-shop"
if grep -q 'pageSize: PAGE_SIZE' "$SHOP/components/account/account-orders-content.tsx" && \
   grep -q 'pageSize: PAGE_SIZE' "$SHOP/components/account/account-reviews-content.tsx" && \
   grep -q 'pageSize: PAGE_SIZE' "$SHOP/components/account/account-notifications-content.tsx"; then
  ok "shop account UI requests pageSize"
else
  bad "shop account UI missing pageSize"
fi

echo ""
echo "REL-007 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
