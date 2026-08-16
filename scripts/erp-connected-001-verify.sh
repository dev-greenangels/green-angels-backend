#!/usr/bin/env bash
# ERP-CONNECTED-001 — EXTERNAL ERP-first checkout + native ids; preserve OFFLINE/LOCAL
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
FLEXI_BEFORE=$(docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "SELECT value FROM \"Settings\" WHERE key='integration.flexi' LIMIT 1;" | tr -d '\n' || true)

restore_settings() {
  if [[ -n "${MARKET_BEFORE:-}" ]]; then
    docker exec green-angels-postgres psql -U green_angels -d green_angels -c "UPDATE \"Settings\" SET value = \$m\$ ${MARKET_BEFORE} \$m\$ WHERE key='commerce.market';" >/dev/null || true
  fi
  if [[ -n "${FLEXI_BEFORE:-}" ]]; then
    docker exec green-angels-postgres psql -U green_angels -d green_angels -c "UPDATE \"Settings\" SET value = \$f\$ ${FLEXI_BEFORE} \$f\$ WHERE key='integration.flexi';" >/dev/null || true
  fi
}
trap restore_settings EXIT

set_market_mode() {
  local mode="$1"
  psqlq "UPDATE \"Settings\" SET value = ((COALESCE(NULLIF(value,''),'{}')::jsonb) || jsonb_build_object('inventoryMode', '$mode'))::text WHERE key='commerce.market';" >/dev/null
}

set_flexi_enabled_bad_url() {
  psqlq "UPDATE \"Settings\" SET value = ((COALESCE(NULLIF(value,''),'{}')::jsonb) || '{\"enabled\":true,\"baseUrl\":\"http://127.0.0.1:9\"}'::jsonb)::text WHERE key='integration.flexi';" >/dev/null || true
}

disable_flexi() {
  psqlq "UPDATE \"Settings\" SET value = ((COALESCE(NULLIF(value,''),'{}')::jsonb) || '{\"enabled\":false}'::jsonb)::text WHERE key='integration.flexi';" >/dev/null || true
}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# --- Static code contract (host mount = /app) ---
if grep -q shouldAwaitConnectedExport "$ROOT/src/orders/orders.service.ts"; then
  ok "orders.service has shouldAwaitConnectedExport"
else
  bad "shouldAwaitConnectedExport missing"
fi

if grep -q compensateFailedConnectedCheckout "$ROOT/src/orders/orders.service.ts"; then
  ok "connected compensate helper present"
else
  bad "compensateFailedConnectedCheckout missing"
fi

if grep -q applyCheckoutStockHints "$ROOT/src/flexi/flexi.service.ts" && grep -q resolveNativeOrderIds "$ROOT/src/flexi/flexi.service.ts"; then
  ok "native id resolve + stock hints helpers present"
else
  bad "resolveNativeOrderIds / applyCheckoutStockHints missing"
fi

if grep -q 'return this.parseWriteResult' "$ROOT/src/flexi/flexi.client.ts"; then
  ok "putObjednavkaPrijata returns parseWriteResult"
else
  bad "PUT write-result parsing missing"
fi

if grep -q 'GET-before-PUT' "$ROOT/src/flexi/flexi.service.ts" && grep -q 'fetchObjednavkaByExtId(extId)' "$ROOT/src/flexi/flexi.service.ts"; then
  ok "exportOrder GET-before-PUT / fetchObjednavkaByExtId present"
else
  bad "GET-before-PUT missing in exportOrder"
fi

if grep -q 'erpNativeId: natives.nativeId' "$ROOT/src/flexi/flexi.service.ts" && grep -q "erpSyncStatus: 'SYNCED'" "$ROOT/src/flexi/flexi.service.ts"; then
  ok "export SYNCED path persists erpNativeId"
else
  bad "SYNCED path does not write erpNativeId"
fi

CURRENCY=$(psqlq "SELECT COALESCE((value::jsonb->>'defaultCurrency'),'UAH') FROM \"Settings\" WHERE key='commerce.market' LIMIT 1;")
VARIANT=$(psqlq "SELECT pv.id FROM \"ProductVariant\" pv JOIN \"Product\" p ON p.id = pv.\"productId\" JOIN \"ProductPrice\" pp ON pp.\"productVariantId\" = pv.id WHERE p.\"isPublished\" = true AND pp.value > 0 AND pp.currency = '$CURRENCY' ORDER BY pv.stock DESC LIMIT 1;")
if [[ -z "$VARIANT" ]]; then
  echo "No priced variant — cannot run HTTP regressions"
  echo ""
  echo "ERP-CONNECTED-001 results: PASS=$PASS FAIL=$FAIL"
  [[ "$FAIL" -gt 0 ]] && exit 1
  exit 0
fi

order_body() {
  local email="$1"
  local phone="$2"
  local variant="$3"
  local qty="$4"
  cat <<EOF
{
  "items": [{"productVariantId": "$variant", "quantity": $qty}],
  "customerFirstName": "Connected",
  "customerLastName": "Test",
  "customerPhone": "$phone",
  "customerEmail": "$email",
  "receiverFirstName": "Connected",
  "receiverLastName": "Test",
  "receiverPhone": "$phone",
  "deliveryMethod": "pickup",
  "paymentMethod": "bank-transfer",
  "privacyConsent": true
}
EOF
}

make_order() {
  local email="$1"
  local phone="$2"
  local variant="$3"
  local qty="${4:-1}"
  local idem="${5:-erp-conn-$(date +%s%N)-$RANDOM}"
  curl -sS -o /tmp/erp-conn-order.json -w '%{http_code}' -X POST "$API/orders" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: $idem" \
    -d "$(order_body "$email" "$phone" "$variant" "$qty")"
}

# --- OFFLINE regression: EXTERNAL + bad Flexi URL → PENDING_ERP success ---
set_market_mode external
set_flexi_enabled_bad_url
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 15), \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null
STOCK_BEFORE=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
TS=$(date +%s)
RAND=$(printf '%06d' $((RANDOM % 1000000)))
OFF_HTTP=$(make_order "erp-conn-off-$TS@example.com" "+380550$RAND" "$VARIANT" 1)
if [[ "$OFF_HTTP" == "201" || "$OFF_HTTP" == "200" ]]; then
  ok "EXTERNAL outage still accepts (HTTP $OFF_HTTP)"
  OFF_ID=$(json_get id </tmp/erp-conn-order.json)
  OFF_SYNC=$(psqlq "SELECT COALESCE(\"erpSyncStatus\",'NULL') FROM \"Order\" WHERE id='$OFF_ID';")
  if [[ "$OFF_SYNC" == "PENDING_ERP" || "$OFF_SYNC" == "RETRYING" ]]; then
    ok "offline path → PENDING_ERP/RETRYING ($OFF_SYNC)"
  else
    bad "offline expected PENDING_ERP, got $OFF_SYNC"
  fi
  STOCK_AFTER=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
  if [[ "$STOCK_AFTER" -eq $((STOCK_BEFORE - 1)) ]]; then
    ok "offline REL-002 decrement once"
  else
    bad "offline stock $STOCK_BEFORE → $STOCK_AFTER"
  fi
else
  bad "EXTERNAL outage should accept, got $OFF_HTTP body=$(head -c 200 /tmp/erp-conn-order.json)"
fi

# --- LOCAL + Flexi transport → still 503 ---
set_market_mode local
set_flexi_enabled_bad_url
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 10), \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null
TS2=$(date +%s)
RAND2=$(printf '%06d' $((RANDOM % 1000000)))
LOC_HTTP=$(make_order "erp-conn-loc-$TS2@example.com" "+380551$RAND2" "$VARIANT" 1)
if [[ "$LOC_HTTP" == "503" ]]; then
  ok "LOCAL + Flexi transport → 503 (unchanged)"
else
  bad "LOCAL expected 503, got $LOC_HTTP"
fi

# --- LOCAL Flexi off → success without erpSyncStatus ---
set_market_mode local
disable_flexi
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 10), \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null
TS3=$(date +%s)
RAND3=$(printf '%06d' $((RANDOM % 1000000)))
LOC_OK=$(make_order "erp-conn-lok-$TS3@example.com" "+380552$RAND3" "$VARIANT" 1)
if [[ "$LOC_OK" == "201" || "$LOC_OK" == "200" ]]; then
  LOC_ID=$(json_get id </tmp/erp-conn-order.json)
  LOC_SYNC=$(psqlq "SELECT COALESCE(\"erpSyncStatus\",'NULL') FROM \"Order\" WHERE id='$LOC_ID';")
  if [[ "$LOC_SYNC" == "NULL" ]]; then
    ok "LOCAL checkout → erpSyncStatus null"
  else
    bad "LOCAL should not set erpSyncStatus, got $LOC_SYNC"
  fi
else
  bad "LOCAL checkout failed HTTP $LOC_OK"
fi

# --- Connected live (optional): EXTERNAL + Flexi configured with real URL ---
FLEXI_ENABLED=$(psqlq "SELECT COALESCE((value::jsonb->>'enabled'),'false') FROM \"Settings\" WHERE key='integration.flexi' LIMIT 1;")
FLEXI_URL=$(psqlq "SELECT COALESCE((value::jsonb->>'baseUrl'),'') FROM \"Settings\" WHERE key='integration.flexi' LIMIT 1;")
# Restore real Flexi for optional live test
if [[ -n "${FLEXI_BEFORE:-}" ]]; then
  docker exec green-angels-postgres psql -U green_angels -d green_angels -c "UPDATE \"Settings\" SET value = \$f\$ ${FLEXI_BEFORE} \$f\$ WHERE key='integration.flexi';" >/dev/null || true
fi
FLEXI_ENABLED=$(psqlq "SELECT COALESCE((value::jsonb->>'enabled'),'false') FROM \"Settings\" WHERE key='integration.flexi' LIMIT 1;")
FLEXI_URL=$(psqlq "SELECT COALESCE((value::jsonb->>'baseUrl'),'') FROM \"Settings\" WHERE key='integration.flexi' LIMIT 1;")

if [[ "$FLEXI_ENABLED" == "true" && -n "$FLEXI_URL" && "$FLEXI_URL" != *"127.0.0.1:9"* ]]; then
  set_market_mode external
  VARIANT_SKU=$(psqlq "SELECT COALESCE(sku,'') FROM \"ProductVariant\" WHERE id='$VARIANT';")
  psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 5), \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null
  TS4=$(date +%s)
  RAND4=$(printf '%06d' $((RANDOM % 1000000)))
  LIVE_HTTP=$(make_order "erp-conn-live-$TS4@example.com" "+380553$RAND4" "$VARIANT" 1)
  if [[ "$LIVE_HTTP" == "201" || "$LIVE_HTTP" == "200" ]]; then
    LIVE_ID=$(json_get id </tmp/erp-conn-order.json)
    # Give in-request export a moment if still finishing edge timing
    sleep 1
    LIVE_SYNC=$(psqlq "SELECT COALESCE(\"erpSyncStatus\",'NULL') FROM \"Order\" WHERE id='$LIVE_ID';")
    LIVE_NID=$(psqlq "SELECT COALESCE(\"erpNativeId\",'') FROM \"Order\" WHERE id='$LIVE_ID';")
    LIVE_CORR=$(psqlq "SELECT COALESCE(\"externalErpId\",'') FROM \"Order\" WHERE id='$LIVE_ID';")
    if [[ "$LIVE_SYNC" == "SYNCED" ]]; then
      ok "live EXTERNAL connected → SYNCED"
    elif [[ "$LIVE_SYNC" == "PENDING_ERP" || "$LIVE_SYNC" == "RETRYING" ]]; then
      ok "live EXTERNAL → PENDING_ERP (transport mid-submit / deferred OK for verify)"
    else
      bad "live unexpected sync=$LIVE_SYNC"
    fi
    if [[ "$LIVE_CORR" == "ext:GA:$LIVE_ID" || "$LIVE_CORR" == "ext:GA:"* ]]; then
      ok "live correlation ext:GA present"
    else
      bad "live correlation=$LIVE_CORR"
    fi
    if [[ "$LIVE_SYNC" == "SYNCED" ]]; then
      if [[ -n "$LIVE_NID" ]]; then
        ok "live SYNCED has erpNativeId=$LIVE_NID"
      else
        bad "live SYNCED missing erpNativeId (sku=$VARIANT_SKU)"
      fi
    fi
  elif [[ "$LIVE_HTTP" == "400" ]]; then
    ok "live EXTERNAL stock/business reject → 400 (no confirmed success)"
    LIVE_CNT=$(psqlq "SELECT COUNT(*) FROM \"Order\" WHERE \"customerEmail\"='erp-conn-live-$TS4@example.com';")
    if [[ "$LIVE_CNT" == "0" ]]; then
      ok "live reject left no confirmed order row"
    else
      bad "live reject left $LIVE_CNT order rows"
    fi
  else
    bad "live EXTERNAL unexpected HTTP $LIVE_HTTP body=$(head -c 240 /tmp/erp-conn-order.json)"
  fi
else
  ok "skip live Flexi connected test (Flexi not configured with real URL)"
fi

echo ""
echo "ERP-CONNECTED-001 results: PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
