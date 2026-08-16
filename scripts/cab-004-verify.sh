#!/usr/bin/env bash
# CAB-004 / CAB-002 — cabinet order detail UI + list links
set -euo pipefail

PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHOP="$ROOT/green-angels-shop"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

DETAIL_PAGE="$SHOP/app/[locale]/(account)/account/orders/[id]/page.tsx"
DETAIL_UI="$SHOP/components/account/account-order-detail-content.tsx"
LIST_UI="$SHOP/components/account/account-orders-content.tsx"

if [[ -f "$DETAIL_PAGE" ]] && grep -q AccountOrderDetailContent "$DETAIL_PAGE"; then
  ok "account/orders/[id] page present"
else
  bad "detail page missing"
fi

if [[ -f "$DETAIL_UI" ]] && grep -q fetchAccountOrder "$DETAIL_UI"; then
  ok "detail content uses fetchAccountOrder"
else
  bad "detail content incomplete"
fi

if grep -q '/account/orders/\${order.id}' "$LIST_UI" || grep -Fq '/account/orders/${order.id}' "$LIST_UI"; then
  ok "list links to /account/orders/:id"
else
  bad "CAB-002 list links missing"
fi

if grep -q "from '@/i18n/navigation'" "$DETAIL_UI" && \
   grep -q "from '@/i18n/navigation'" "$LIST_UI"; then
  ok "links use @/i18n/navigation"
else
  bad "i18n Link import missing"
fi

KEYS=(
  viewOrder
  orderDetailTitle
  orderDetailSubtitle
  orderNotFound
  backToOrders
  orderNumberLabel
  orderPlacedAt
  orderItems
  orderItemQty
  orderTotal
  orderDetails
  orderDelivery
  orderPayment
  trackingLabel
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
    ok "messages/$loc.json has order detail keys"
  else
    bad "messages/$loc.json missing order detail keys"
  fi
done

if ! grep -q 'ТТН:' "$LIST_UI"; then
  ok "list no hardcoded ТТН"
else
  bad "list still hardcodes ТТН"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
