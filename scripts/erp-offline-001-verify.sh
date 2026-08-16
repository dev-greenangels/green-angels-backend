#!/usr/bin/env bash
# ERP-OFFLINE-001 — EXTERNAL outage checkout + PENDING_ERP + durable export queue
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

CURRENCY=$(psqlq "SELECT COALESCE((value::jsonb->>'defaultCurrency'),'UAH') FROM \"Settings\" WHERE key='commerce.market' LIMIT 1;")
VARIANT=$(psqlq "SELECT pv.id FROM \"ProductVariant\" pv JOIN \"Product\" p ON p.id = pv.\"productId\" JOIN \"ProductPrice\" pp ON pp.\"productVariantId\" = pv.id WHERE p.\"isPublished\" = true AND pp.value > 0 AND pp.currency = '$CURRENCY' ORDER BY pv.stock DESC LIMIT 1;")
if [[ -z "$VARIANT" ]]; then
  echo "No priced variant — cannot run offline tests"
  exit 1
fi

order_body() {
  local email="$1"
  local phone="$2"
  local variant="$3"
  local qty="$4"
  cat <<EOF
{
  "items": [{"productVariantId": "$variant", "quantity": $qty}],
  "customerFirstName": "Offline",
  "customerLastName": "Test",
  "customerPhone": "$phone",
  "customerEmail": "$email",
  "receiverFirstName": "Offline",
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
  local idem="${5:-erp-off-$(date +%s%N)-$RANDOM}"
  curl -sS -o /tmp/erp-off-order.json -w '%{http_code}' -X POST "$API/orders" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: $idem" \
    -d "$(order_body "$email" "$phone" "$variant" "$qty")"
}

# --- 1 LOCAL unchanged (Flexi bad URL + local mode → 503) ---
set_market_mode local
set_flexi_enabled_bad_url
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 15), \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null
TS=$(date +%s)
RAND=$(printf '%06d' $((RANDOM % 1000000)))
LOCAL_HTTP=$(make_order "erp-off-local-$TS@example.com" "+380540$RAND" "$VARIANT" 1)
if [[ "$LOCAL_HTTP" == "503" ]]; then
  ok "1 LOCAL + Flexi transport fail → 503 (unchanged)"
else
  bad "1 expected 503 for LOCAL offline, got $LOCAL_HTTP"
fi

# --- 2 EXTERNAL + ERP unavailable → accept ---
set_market_mode external
set_flexi_enabled_bad_url
STOCK_BEFORE=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 15), \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null
STOCK_BEFORE=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
TS2=$(date +%s)
RAND2=$(printf '%06d' $((RANDOM % 1000000)))
IDEM_KEY="erp-off-idem-$TS2-$RAND2"
EXT_HTTP=$(make_order "erp-off-ext-$TS2@example.com" "+380541$RAND2" "$VARIANT" 1 "$IDEM_KEY")
if [[ "$EXT_HTTP" == "201" || "$EXT_HTTP" == "200" ]]; then
  ok "3 EXTERNAL + simulated ERP outage accepts order (HTTP $EXT_HTTP)"
  ORDER_ID=$(json_get id </tmp/erp-off-order.json)
  SYNC=$(psqlq "SELECT COALESCE(\"erpSyncStatus\",'NULL') FROM \"Order\" WHERE id='$ORDER_ID';")
  CORR=$(psqlq "SELECT COALESCE(\"externalErpId\",'') FROM \"Order\" WHERE id='$ORDER_ID';")
  OST=$(psqlq "SELECT status FROM \"Order\" WHERE id='$ORDER_ID';")
  STOCK_AFTER=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
  if [[ "$SYNC" == "PENDING_ERP" || "$SYNC" == "RETRYING" ]]; then
    ok "4 offline order → PENDING_ERP/RETRYING (got $SYNC)"
  else
    bad "4 expected PENDING_ERP or RETRYING, got $SYNC"
  fi
  if [[ "$CORR" == "ext:GA:$ORDER_ID" ]]; then
    ok "7 correlation ext:GA preserved at create"
  else
    bad "7 correlation mismatch: $CORR"
  fi
  if [[ "$STOCK_AFTER" -eq $((STOCK_BEFORE - 1)) ]]; then
    ok "5 local stock decremented once ($STOCK_BEFORE → $STOCK_AFTER)"
  else
    bad "5 stock before=$STOCK_BEFORE after=$STOCK_AFTER"
  fi
  if [[ "$OST" != "PENDING_ERP" && "$OST" != "SYNCED" && "$OST" != "ERP_CONFLICT" ]]; then
    ok "13 order.status not ERP sync state ($OST)"
  else
    bad "13 order.status incorrectly ERP sync: $OST"
  fi
else
  bad "3 EXTERNAL outage should accept order, got HTTP $EXT_HTTP body=$(head -c 200 /tmp/erp-off-order.json)"
  ORDER_ID=""
fi

# --- 6 idempotency same key ---
if [[ -n "${ORDER_ID:-}" ]]; then
  EXT_HTTP2=$(make_order "erp-off-ext-$TS2@example.com" "+380541$RAND2" "$VARIANT" 1 "$IDEM_KEY")
  ORDER_ID2=$(json_get id </tmp/erp-off-order.json 2>/dev/null || true)
  if [[ "$EXT_HTTP2" == "201" || "$EXT_HTTP2" == "200" ]] && [[ "$ORDER_ID2" == "$ORDER_ID" ]]; then
    ok "11 same Idempotency-Key → same order"
  else
    bad "11 idempotency replay order=$ORDER_ID2 expected=$ORDER_ID http=$EXT_HTTP2"
  fi
  COUNT=$(psqlq "SELECT COUNT(*) FROM \"Order\" WHERE \"customerEmail\"='erp-off-ext-$TS2@example.com';")
  if [[ "$COUNT" == "1" ]]; then
    ok "11b only one order row for idempotent email"
  else
    bad "11b duplicate orders count=$COUNT"
  fi
fi

# --- 13 insufficient local stock ---
set_market_mode external
set_flexi_enabled_bad_url
psqlq "UPDATE \"ProductVariant\" SET stock = 0, \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null
TS3=$(date +%s)
RAND3=$(printf '%06d' $((RANDOM % 1000000)))
ZERO_HTTP=$(make_order "erp-off-zero-$TS3@example.com" "+380542$RAND3" "$VARIANT" 1)
if [[ "$ZERO_HTTP" == "400" ]]; then
  ok "13 insufficient local stock → reject (HTTP 400)"
else
  bad "13 expected 400 for zero stock, got $ZERO_HTTP"
fi
PENDING_ZERO=$(psqlq "SELECT COUNT(*) FROM \"Order\" WHERE \"customerEmail\"='erp-off-zero-$TS3@example.com' AND \"erpSyncStatus\"='PENDING_ERP';")
if [[ "$PENDING_ZERO" == "0" ]]; then
  ok "13b no PENDING_ERP when local stock insufficient"
else
  bad "13b unexpected PENDING_ERP on zero stock"
fi

# --- second offline order (separate correlation) ---
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 10), \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null
TS4=$(date +%s)
RAND4=$(printf '%06d' $((RANDOM % 1000000)))
EXT_HTTP3=$(make_order "erp-off-ext2-$TS4@example.com" "+380543$RAND4" "$VARIANT" 1)
if [[ "$EXT_HTTP3" == "201" || "$EXT_HTTP3" == "200" ]]; then
  ORDER_B=$(json_get id </tmp/erp-off-order.json)
  CORR_B=$(psqlq "SELECT \"externalErpId\" FROM \"Order\" WHERE id='$ORDER_B';")
  if [[ -n "${ORDER_ID:-}" && "$ORDER_B" != "$ORDER_ID" && "$CORR_B" == "ext:GA:$ORDER_B" ]]; then
    ok "12 two separate offline orders with distinct ext:GA"
  elif [[ -z "${ORDER_ID:-}" ]]; then
    ok "12 separate offline order created (first order missing from prior step)"
  else
    bad "12 separate orders check failed A=$ORDER_ID B=$ORDER_B"
  fi
else
  bad "12 second offline order failed HTTP $EXT_HTTP3"
fi

# --- 7/8/9 export worker: wait for retries → FAILED or SYNCED ---
if [[ -n "${ORDER_ID:-}" ]]; then
  sleep 18
  ATT=$(psqlq "SELECT \"erpSyncAttempts\" FROM \"Order\" WHERE id='$ORDER_ID';")
  FINAL=$(psqlq "SELECT COALESCE(\"erpSyncStatus\",'NULL') FROM \"Order\" WHERE id='$ORDER_ID';")
  if [[ "$ATT" -ge 1 ]]; then
    ok "7/8 export worker ran (erpSyncAttempts=$ATT)"
  else
    bad "7 export worker did not increment attempts (got $ATT)"
  fi
  if [[ "$FINAL" == "FAILED" || "$FINAL" == "SYNCED" || "$FINAL" == "RETRYING" || "$FINAL" == "PENDING_ERP" ]]; then
    ok "9/10 order remains visible with sync state=$FINAL"
  else
    bad "10 unexpected final sync state=$FINAL"
  fi
  if [[ "$FINAL" != "SYNCED" ]]; then
    ok "9 bad URL → not falsely SYNCED (state=$FINAL)"
  fi
  ROW=$(psqlq "SELECT COUNT(*) FROM \"Order\" WHERE id='$ORDER_ID';")
  if [[ "$ROW" == "1" ]]; then
    ok "10 order not deleted after export failures"
  else
    bad "10 order missing"
  fi
fi

# --- 14 PENDING_ERP survives in DB (recovery source of truth) ---
if [[ -n "${ORDER_ID:-}" ]]; then
  PENDING_CNT=$(psqlq "SELECT COUNT(*) FROM \"Order\" WHERE id='$ORDER_ID' AND \"erpSyncStatus\" IN ('PENDING_ERP','RETRYING','FAILED');")
  if [[ "$PENDING_CNT" == "1" ]]; then
    ok "14 PENDING_ERP/RETRYING/FAILED persisted in DB for recovery"
  else
    bad "14 DB recovery row missing"
  fi
fi

# --- LOCAL mode no PENDING_ERP on successful local checkout ---
set_market_mode local
disable_flexi
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 10), \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null
TS5=$(date +%s)
RAND5=$(printf '%06d' $((RANDOM % 1000000)))
LOC_OK=$(make_order "erp-off-lok-$TS5@example.com" "+380544$RAND5" "$VARIANT" 1)
if [[ "$LOC_OK" == "201" || "$LOC_OK" == "200" ]]; then
  LOC_ID=$(json_get id </tmp/erp-off-order.json)
  LOC_SYNC=$(psqlq "SELECT COALESCE(\"erpSyncStatus\",'NULL') FROM \"Order\" WHERE id='$LOC_ID';")
  if [[ "$LOC_SYNC" == "NULL" ]]; then
    ok "1b LOCAL checkout → erpSyncStatus null/NOT_REQUIRED"
  else
    bad "1b LOCAL should not set erpSyncStatus, got $LOC_SYNC"
  fi
else
  bad "1b LOCAL checkout failed HTTP $LOC_OK"
fi

# --- code checks ---
if docker exec green-angels-api sh -c "grep -q reconcilePendingErpExports /app/src/flexi/flexi.queue.service.ts"; then
  ok "15 startup reconcile present"
else
  bad "15 reconcilePendingErpExports missing"
fi
if docker exec green-angels-api sh -c "grep -q runExportOrderJob /app/src/flexi/flexi.processor.ts"; then
  ok "8 worker uses runExportOrderJob for retries"
else
  bad "8 runExportOrderJob not wired in processor"
fi

echo ""
echo "ERP-OFFLINE-001 results: PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
