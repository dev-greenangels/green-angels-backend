#!/usr/bin/env bash
# INV-MODE-001 — inventory authority mode setting (LOCAL | EXTERNAL)
# Does NOT assert checkout/Flexi wiring changes — mode is config-only in this batch.
set -euo pipefail

API="${API:-http://localhost:3001}"
PASS=0
FAIL=0

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

psqlq() {
  docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "$1" | head -n1 | tr -d '[:space:]'
}

json_get() {
  node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); const p='$1'.split('.'); let v=d; for (const k of p){ if(v==null){process.exit(2)}; v=v[k]; } if(v===undefined||v===null) process.exit(2); process.stdout.write(String(v));"
}

MARKET_BEFORE=$(docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "SELECT value FROM \"Settings\" WHERE key='commerce.market' LIMIT 1;" | tr -d '\n' || true)

restore_market() {
  if [[ -n "${MARKET_BEFORE:-}" ]]; then
    docker exec green-angels-postgres psql -U green_angels -d green_angels -c "UPDATE \"Settings\" SET value = \$market\$ ${MARKET_BEFORE} \$market\$ WHERE key='commerce.market';" >/dev/null || true
  fi
}
trap restore_market EXIT

ADMIN_ID=$(psqlq "SELECT id FROM \"User\" WHERE role IN ('ADMIN','MANAGER') ORDER BY \"createdAt\" ASC LIMIT 1;")
if [[ -z "$ADMIN_ID" ]]; then
  ADMIN_ID=$(psqlq "INSERT INTO \"User\" (id, email, \"emailVerified\", phone, \"phoneVerified\", \"firstName\", \"lastName\", role, newsletter, optin, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'inv-mode-admin-$(date +%s)@example.com', true, null, false, 'Inv', 'Admin', 'ADMIN', false, false, NOW(), NOW()) RETURNING id;")
fi

ADMIN_JWT=$(docker exec green-angels-api node -e "
const jwt=require('jsonwebtoken');
const secret=process.env.JWT_SECRET;
process.stdout.write(jwt.sign({ role: 'admin', v: 1 }, secret, { subject: process.argv[1], expiresIn: '1h' }));
" "$ADMIN_ID")

# --- Unit: normalize defaults / reject invalid via Nest settings module after build path ---
# Prefer live public GET + PATCH validation (runtime).

PUBLIC=$(curl -sS "$API/settings/public")
MODE=$(echo "$PUBLIC" | json_get market.inventoryMode || true)
if [[ "$MODE" == "local" || "$MODE" == "external" ]]; then
  ok "public settings expose inventoryMode=$MODE"
else
  # Missing key should normalize to local on API after restart with new code
  if [[ -z "$MODE" || "$MODE" == "" ]]; then
    bad "inventoryMode missing from public settings (API may need reload with INV-MODE-001 code)"
  else
    bad "unexpected inventoryMode=$MODE"
  fi
fi

# Default when key absent in DB: strip inventoryMode and re-read
psqlq "UPDATE \"Settings\" SET value = (COALESCE(NULLIF(value,''),'{}')::jsonb - 'inventoryMode')::text WHERE key='commerce.market';" >/dev/null || true
PUBLIC2=$(curl -sS "$API/settings/public")
MODE2=$(echo "$PUBLIC2" | json_get market.inventoryMode || true)
if [[ "$MODE2" == "local" ]]; then
  ok "missing inventoryMode defaults to local (backward-compatible)"
else
  bad "expected default local, got '$MODE2'"
fi

# Persist EXTERNAL
EXT_RESP=$(curl -sS -o /tmp/inv-mode-ext.json -w '%{http_code}' -X PATCH "$API/settings/market" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H 'Content-Type: application/json' \
  -d '{"inventoryMode":"external"}')
if [[ "$EXT_RESP" == "200" ]]; then
  EXT_MODE=$(json_get inventoryMode </tmp/inv-mode-ext.json)
  if [[ "$EXT_MODE" == "external" ]]; then
    ok "PATCH inventoryMode=external persists"
  else
    bad "PATCH external returned inventoryMode=$EXT_MODE"
  fi
else
  bad "PATCH external HTTP $EXT_RESP body=$(cat /tmp/inv-mode-ext.json 2>/dev/null | head -c 200)"
fi

DB_EXT=$(psqlq "SELECT value::jsonb->>'inventoryMode' FROM \"Settings\" WHERE key='commerce.market' LIMIT 1;")
if [[ "$DB_EXT" == "external" ]]; then
  ok "DB stores inventoryMode=external"
else
  bad "DB inventoryMode=$DB_EXT after external patch"
fi

# Persist LOCAL
LOC_RESP=$(curl -sS -o /tmp/inv-mode-loc.json -w '%{http_code}' -X PATCH "$API/settings/market" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H 'Content-Type: application/json' \
  -d '{"inventoryMode":"local"}')
if [[ "$LOC_RESP" == "200" ]]; then
  LOC_MODE=$(json_get inventoryMode </tmp/inv-mode-loc.json)
  if [[ "$LOC_MODE" == "local" ]]; then
    ok "PATCH inventoryMode=local persists"
  else
    bad "PATCH local returned inventoryMode=$LOC_MODE"
  fi
else
  bad "PATCH local HTTP $LOC_RESP"
fi

# Invalid mode rejected
INV_RESP=$(curl -sS -o /tmp/inv-mode-bad.json -w '%{http_code}' -X PATCH "$API/settings/market" \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H 'Content-Type: application/json' \
  -d '{"inventoryMode":"hybrid"}')
if [[ "$INV_RESP" == "400" ]]; then
  ok "invalid inventoryMode rejected (HTTP 400)"
else
  bad "expected 400 for hybrid, got $INV_RESP"
fi

# inventoryMode wired for EXTERNAL offline checkout (ERP-OFFLINE-001); LOCAL path unchanged.
if docker exec green-angels-api sh -c "grep -q 'isExternalInventoryMode' /app/src/orders/orders.service.ts"; then
  ok "orders.service reads inventoryMode (EXTERNAL offline path)"
else
  bad "isExternalInventoryMode not wired in orders.service"
fi

# Soft regression: order create still works with Flexi disabled (REL-002 path intact)
FLEXI_BEFORE=$(docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "SELECT value FROM \"Settings\" WHERE key='integration.flexi' LIMIT 1;" | tr -d '\n' || true)
psqlq "UPDATE \"Settings\" SET value = ((COALESCE(NULLIF(value,''),'{}')::jsonb) || '{\"enabled\":false}'::jsonb)::text WHERE key='integration.flexi';" >/dev/null || true
restore_flexi() {
  if [[ -n "${FLEXI_BEFORE:-}" ]]; then
    docker exec green-angels-postgres psql -U green_angels -d green_angels -c "UPDATE \"Settings\" SET value = \$flexi\$ ${FLEXI_BEFORE} \$flexi\$ WHERE key='integration.flexi';" >/dev/null || true
  fi
  restore_market
}
trap restore_flexi EXIT

CURRENCY=$(psqlq "SELECT COALESCE((value::jsonb->>'defaultCurrency'),'UAH') FROM \"Settings\" WHERE key='commerce.market' LIMIT 1;")
VARIANT=$(psqlq "SELECT pv.id FROM \"ProductVariant\" pv JOIN \"Product\" p ON p.id = pv.\"productId\" JOIN \"ProductPrice\" pp ON pp.\"productVariantId\" = pv.id WHERE p.\"isPublished\" = true AND pp.value > 0 AND pp.currency = '$CURRENCY' ORDER BY pv.stock DESC LIMIT 1;")
if [[ -z "$VARIANT" ]]; then
  bad "no variant for order smoke"
else
  psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 20), \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null || true
  STOCK_BEFORE=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
  TS=$(date +%s)
  RAND=$(printf '%06d' $((RANDOM % 1000000)))
  ORDER_HTTP=$(curl -sS -o /tmp/inv-mode-order.json -w '%{http_code}' -X POST "$API/orders" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: inv-mode-$TS-$RAND" \
    -d "{
      \"items\": [{\"productVariantId\": \"$VARIANT\", \"quantity\": 1}],
      \"customerFirstName\": \"Inv\",
      \"customerLastName\": \"Mode\",
      \"customerPhone\": \"+380520$RAND\",
      \"customerEmail\": \"inv-mode-$TS@example.com\",
      \"receiverFirstName\": \"Inv\",
      \"receiverLastName\": \"Mode\",
      \"receiverPhone\": \"+380520$RAND\",
      \"deliveryMethod\": \"pickup\",
      \"paymentMethod\": \"bank-transfer\",
      \"privacyConsent\": true
    }")
  if [[ "$ORDER_HTTP" == "201" || "$ORDER_HTTP" == "200" ]]; then
    STOCK_AFTER=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
    if [[ "$STOCK_AFTER" -eq $((STOCK_BEFORE - 1)) ]]; then
      ok "order create + REL-002 stock decrement unchanged (stock $STOCK_BEFORE → $STOCK_AFTER)"
    else
      bad "stock not decremented: before=$STOCK_BEFORE after=$STOCK_AFTER"
    fi
  else
    bad "order create HTTP $ORDER_HTTP body=$(head -c 240 /tmp/inv-mode-order.json)"
  fi
fi

echo ""
echo "INV-MODE-001 results: PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
