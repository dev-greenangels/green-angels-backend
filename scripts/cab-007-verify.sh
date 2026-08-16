#!/usr/bin/env bash
# CAB-007 — account reviews storeReply + category product hrefs
set -euo pipefail

PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$ROOT/green-angels-backend"
SHOP="$ROOT/green-angels-shop"
SVC="$BACKEND/src/account/account.service.ts"
UI="$SHOP/components/account/account-reviews-content.tsx"
API="$SHOP/lib/account/api.ts"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

if grep -q productCategorySlug "$SVC" && grep -q 'category: { select: { slug: true } }' "$SVC"; then
  ok "Nest account reviews include category slug"
else
  bad "Nest productCategorySlug missing"
fi

if ! grep -q PLACEHOLDER "$SVC"; then
  ok "account.service.ts no placeholder leftovers"
else
  bad "placeholder leftover in account.service.ts"
fi

if grep -q productCategorySlug "$API"; then
  ok "shop AccountReviewItem has productCategorySlug"
else
  bad "shop type missing productCategorySlug"
fi

if grep -q ReviewStoreReply "$UI" && grep -q 'review.storeReply' "$UI"; then
  ok "account reviews render ReviewStoreReply"
else
  bad "storeReply UI missing"
fi

if grep -q productHrefFromPlant "$UI" && ! grep -q 'href={`/product/\${review.productSlug}`}' "$UI"; then
  ok "product links use productHrefFromPlant"
else
  bad "product href still legacy-only or missing helper"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
