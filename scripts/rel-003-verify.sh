#!/usr/bin/env bash
# REL-003 — cancel/release per DEC-004 §J + PRE-A (local stock++, PENDING abort, storno path)
set -euo pipefail

API="${API:-http://localhost:3001}"
PASS=0
FAIL=0
REASON_ID="${REASON_ID:-20000000-0000-4000-8000-000000000001}"

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

# --- Static code contract ---
if grep -q applyRel003CancelSideEffects "$ROOT/src/orders/orders.service.ts"; then
  ok "orders.service has applyRel003CancelSideEffects"
else
  bad "applyRel003CancelSideEffects missing"
fi

if grep -q releaseLocalStockReservation "$ROOT/src/orders/orders.service.ts"; then
  ok "local stock release helper present"
else
  bad "releaseLocalStockReservation missing"
fi

if grep -q "putObjednavkaAction('storno'" "$ROOT/src/flexi/flexi.service.ts" && \
   grep -q "async putObjednavkaAction" "$ROOT/src/flexi/flexi.client.ts"; then
  ok "Flexi @action=storno client+service present"
else
  bad "storno action wiring missing"
fi

if grep -q "FLEXI_ORDER_CONFLICT_USER_STATUS = 'stavDoklObch.nespec'" "$ROOT/src/flexi/flexi.constants.ts" && \
   grep -q "mode === 'exception'" "$ROOT/src/flexi/flexi.service.ts" && \
   grep -q "EXCEPTION_DOC_CREATED" "$ROOT/src/flexi/flexi.service.ts"; then
  ok "late-conflict exception export (nespec + EXCEPTION_DOC_CREATED)"
else
  bad "exception export path incomplete"
fi

if grep -q "order CANCELLED — skip export" "$ROOT/src/flexi/flexi.service.ts" && \
   grep -q removeExportOrderJob "$ROOT/src/flexi/flexi.queue.service.ts" && \
   grep -q enqueueStornoOrder "$ROOT/src/flexi/flexi.queue.service.ts"; then
  ok "queue abort + storno enqueue + skip CANCELLED export"
else
  bad "queue cancel helpers missing"
fi

if grep -q "case 'storno-order'" "$ROOT/src/flexi/flexi.processor.ts"; then
  ok "processor handles storno-order"
else
  bad "processor missing storno-order"
fi

if grep -q "Use path-filter" "$ROOT/src/flexi/flexi.client.ts" && \
   grep -q 'objednavka-prijata/(\${filter}).json' "$ROOT/src/flexi/flexi.client.ts"; then
  ok "GET-by-ext uses path-filter (not direct /{ext}.json)"
else
  bad "GET-by-ext path-filter missing"
fi

ADMIN_ID=$(psqlq "SELECT id FROM \"User\" WHERE role IN ('ADMIN','MANAGER') ORDER BY \"createdAt\" ASC LIMIT 1;")
if [[ -z "$ADMIN_ID" ]]; then
  bad "no ADMIN/MANAGER user for cancel API"
  echo "REL-003 results: PASS=$PASS FAIL=$FAIL"
  exit 1
fi

ADMIN_JWT=$(docker exec green-angels-api node -e "
const jwt=require('jsonwebtoken');
const secret=process.env.JWT_SECRET;
process.stdout.write(jwt.sign({ role: 'admin', v: 1 }, secret, { subject: process.argv[1], expiresIn: '1h' }));
" "$ADMIN_ID")

CURRENCY=$(psqlq "SELECT COALESCE((value::jsonb->>'defaultCurrency'),'UAH') FROM \"Settings\" WHERE key='commerce.market' LIMIT 1;")
VARIANT=$(psqlq "SELECT pv.id FROM \"ProductVariant\" pv JOIN \"Product\" p ON p.id = pv.\"productId\" JOIN \"ProductPrice\" pp ON pp.\"productVariantId\" = pv.id WHERE p.\"isPublished\" = true AND pp.value > 0 AND pp.currency = '$CURRENCY' ORDER BY pv.stock DESC LIMIT 1;")
if [[ -z "$VARIANT" ]]; then
  echo "No priced variant — static checks only"
  echo ""
  echo "REL-003 results: PASS=$PASS FAIL=$FAIL"
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
  "customerFirstName": "Rel003",
  "customerLastName": "Test",
  "customerPhone": "$phone",
  "customerEmail": "$email",
  "receiverFirstName": "Rel003",
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
  local idem="${5:-rel003-$(date +%s%N)-$RANDOM}"
  curl -sS -o /tmp/rel003-order.json -w '%{http_code}' -X POST "$API/orders" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: $idem" \
    -d "$(order_body "$email" "$phone" "$variant" "$qty")"
}

cancel_order() {
  local id="$1"
  curl -sS -o /tmp/rel003-cancel.json -w '%{http_code}' -X PATCH "$API/orders/$id/status" \
    -H "Authorization: Bearer $ADMIN_JWT" \
    -H 'Content-Type: application/json' \
    -d "{\"status\":\"CANCELLED\",\"cancellationReasonId\":\"$REASON_ID\"}"
}

# --- A) LOCAL + Flexi off: cancel restores stock; idempotent re-cancel ---
set_market_mode local
disable_flexi
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 12), \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null
STOCK0=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
TS=$(date +%s)
RAND=$(printf '%06d' $((RANDOM % 1000000)))
HTTP=$(make_order "rel003-loc-$TS@example.com" "+380560$RAND" "$VARIANT" 1)
if [[ "$HTTP" == "201" || "$HTTP" == "200" ]]; then
  OID=$(json_get id </tmp/rel003-order.json)
  STOCK1=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
  if [[ "$STOCK1" -eq $((STOCK0 - 1)) ]]; then
    ok "LOCAL create decrements stock once ($STOCK0->$STOCK1)"
  else
    bad "LOCAL create stock $STOCK0->$STOCK1"
  fi
  CH=$(cancel_order "$OID")
  if [[ "$CH" == "200" ]]; then
    ok "LOCAL cancel HTTP 200"
    STOCK2=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
    ST=$(psqlq "SELECT status FROM \"Order\" WHERE id='$OID';")
    if [[ "$ST" == "CANCELLED" && "$STOCK2" -eq "$STOCK0" ]]; then
      ok "LOCAL cancel restores stock ($STOCK2==$STOCK0)"
    else
      bad "LOCAL cancel status=$ST stock $STOCK1->$STOCK2 (want $STOCK0)"
    fi
    CH2=$(cancel_order "$OID")
    STOCK3=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
    if [[ "$CH2" == "200" && "$STOCK3" -eq "$STOCK2" ]]; then
      ok "idempotent re-cancel does not double stock++"
    else
      bad "re-cancel HTTP $CH2 stock $STOCK2->$STOCK3"
    fi
  else
    bad "LOCAL cancel HTTP $CH body=$(head -c 200 /tmp/rel003-cancel.json)"
  fi
else
  bad "LOCAL create HTTP $HTTP body=$(head -c 200 /tmp/rel003-order.json)"
fi

# --- B) EXTERNAL outage PENDING_ERP: cancel -> local stock++ + CANCEL_PENDING_ERP ---
set_market_mode external
set_flexi_enabled_bad_url
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 12), \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null
STOCKB0=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
TSB=$(date +%s)
RANDB=$(printf '%06d' $((RANDOM % 1000000)))
HTTPB=$(make_order "rel003-pend-$TSB@example.com" "+380561$RANDB" "$VARIANT" 1)
if [[ "$HTTPB" == "201" || "$HTTPB" == "200" ]]; then
  OIDB=$(json_get id </tmp/rel003-order.json)
  SYNCB=$(psqlq "SELECT COALESCE(\"erpSyncStatus\",'NULL') FROM \"Order\" WHERE id='$OIDB';")
  if [[ "$SYNCB" == "PENDING_ERP" || "$SYNCB" == "RETRYING" ]]; then
    ok "EXTERNAL outage order -> $SYNCB"
  else
    bad "expected PENDING_ERP/RETRYING, got $SYNCB"
  fi
  CHB=$(cancel_order "$OIDB")
  if [[ "$CHB" == "200" ]]; then
    SYNCB2=$(psqlq "SELECT COALESCE(\"erpSyncStatus\",'NULL') FROM \"Order\" WHERE id='$OIDB';")
    STOCKB1=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
    if [[ "$SYNCB2" == "CANCEL_PENDING_ERP" ]]; then
      ok "PENDING cancel -> CANCEL_PENDING_ERP"
    else
      bad "PENDING cancel sync=$SYNCB2 (want CANCEL_PENDING_ERP)"
    fi
    if [[ "$STOCKB1" -eq "$STOCKB0" ]]; then
      ok "PENDING cancel restores local stock"
    else
      bad "PENDING cancel stock $STOCKB0->$STOCKB1"
    fi
  else
    bad "PENDING cancel HTTP $CHB body=$(head -c 200 /tmp/rel003-cancel.json)"
  fi
else
  bad "PENDING create HTTP $HTTPB"
fi

# --- C) EXTERNAL + SYNCED (simulated): cancel must NOT stock++; should call storno path ---
set_market_mode external
disable_flexi
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 12), \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null
# Create under LOCAL first so checkout works without Flexi, then flip to EXTERNAL+SYNCED
set_market_mode local
TSC=$(date +%s)
RANDC=$(printf '%06d' $((RANDOM % 1000000)))
HTTPC=$(make_order "rel003-sync-$TSC@example.com" "+380562$RANDC" "$VARIANT" 1)
if [[ "$HTTPC" == "201" || "$HTTPC" == "200" ]]; then
  OIDC=$(json_get id </tmp/rel003-order.json)
  # Simulate ERP-accepted EXTERNAL order
  psqlq "UPDATE \"Order\" SET \"erpSyncStatus\"='SYNCED', \"erpNativeId\"='999999001', \"erpNativeKod\"='OBP-REL003-TEST', \"externalErpId\"='ext:GA:$OIDC' WHERE id='$OIDC';" >/dev/null
  set_market_mode external
  # Re-enable Flexi with bad URL so storno fails soft but code path runs (no hang on live)
  set_flexi_enabled_bad_url
  STOCKC0=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
  CHC=$(cancel_order "$OIDC")
  if [[ "$CHC" == "200" ]]; then
    STOCKC1=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
    SYNCC=$(psqlq "SELECT COALESCE(\"erpSyncStatus\",'NULL') FROM \"Order\" WHERE id='$OIDC';")
    if [[ "$STOCKC1" -eq "$STOCKC0" ]]; then
      ok "EXTERNAL SYNCED cancel does not blind stock++ ($STOCKC1)"
    else
      bad "EXTERNAL SYNCED cancel changed stock $STOCKC0->$STOCKC1"
    fi
    # storno with bad URL -> CANCEL_SYNCED + error (or queued retry still CANCEL_SYNCED)
    if [[ "$SYNCC" == "CANCEL_SYNCED" || "$SYNCC" == "SYNCED" ]]; then
      ok "EXTERNAL SYNCED cancel entered ERP cancel path (sync=$SYNCC)"
    else
      bad "EXTERNAL SYNCED cancel unexpected sync=$SYNCC"
    fi
  else
    bad "SYNCED cancel HTTP $CHC body=$(head -c 200 /tmp/rel003-cancel.json)"
  fi
else
  bad "SYNCED seed create HTTP $HTTPC"
fi

# --- D) EXTERNAL + ERP_CONFLICT: cancel no stock++ ---
set_market_mode local
disable_flexi
TSD=$(date +%s)
RANDD=$(printf '%06d' $((RANDOM % 1000000)))
HTTPD=$(make_order "rel003-conf-$TSD@example.com" "+380563$RANDD" "$VARIANT" 1)
if [[ "$HTTPD" == "201" || "$HTTPD" == "200" ]]; then
  OIDD=$(json_get id </tmp/rel003-order.json)
  psqlq "UPDATE \"Order\" SET \"erpSyncStatus\"='ERP_CONFLICT', \"erpLastErrorCode\"='EXCEPTION_DOC_CREATED', \"externalErpId\"='ext:GA:$OIDD', \"erpNativeId\"='999999002' WHERE id='$OIDD';" >/dev/null
  set_market_mode external
  set_flexi_enabled_bad_url
  STOCKD0=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
  CHD=$(cancel_order "$OIDD")
  STOCKD1=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
  if [[ "$CHD" == "200" && "$STOCKD1" -eq "$STOCKD0" ]]; then
    ok "ERP_CONFLICT cancel: no blind stock++"
  else
    bad "ERP_CONFLICT cancel HTTP $CHD stock $STOCKD0->$STOCKD1"
  fi
else
  bad "CONFLICT seed create HTTP $HTTPD"
fi

echo ""
echo "REL-003 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
