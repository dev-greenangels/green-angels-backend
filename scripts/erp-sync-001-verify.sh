#!/usr/bin/env bash
# ERP-SYNC-001 — durable ERP sync foundation (schema + fields; no offline/connected checkout)
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

# 1–3 columns + default attempts
COLS=$(psqlq "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='Order' AND column_name IN ('erpSyncStatus','erpNativeId','erpNativeKod','erpSyncAttempts','erpLastErrorCode','erpLastErrorMessage','erpLastSyncAt','erpSyncedAt');")
if [[ "$COLS" == "8" ]]; then
  ok "migration columns exist (8)"
else
  bad "expected 8 ERP sync columns, got $COLS"
fi

DEF=$(psqlq "SELECT column_default FROM information_schema.columns WHERE table_name='Order' AND column_name='erpSyncAttempts';")
if [[ "$DEF" == *"0"* ]]; then
  ok "erpSyncAttempts default = 0"
else
  bad "erpSyncAttempts default=$DEF"
fi

IDX=$(psqlq "SELECT COUNT(*) FROM pg_indexes WHERE tablename='Order' AND indexname IN ('Order_erpSyncStatus_idx','Order_erpNativeKod_idx');")
if [[ "$IDX" == "2" ]]; then
  ok "erpSyncStatus + erpNativeKod indexes exist"
else
  bad "expected 2 indexes, got $IDX"
fi

# Pick an order (or create via API later)
ORDER_ID=$(psqlq "SELECT id FROM \"Order\" ORDER BY \"createdAt\" DESC LIMIT 1;")
if [[ -z "$ORDER_ID" ]]; then
  bad "no orders in DB for field round-trip"
else
  BEFORE_CORR=$(psqlq "SELECT COALESCE(\"externalErpId\",'') FROM \"Order\" WHERE id='$ORDER_ID';")
  BEFORE_STATUS=$(psqlq "SELECT COALESCE(status,'') FROM \"Order\" WHERE id='$ORDER_ID';")

  psqlq "UPDATE \"Order\" SET \"erpSyncStatus\"='PENDING_ERP', \"erpNativeId\"='native-test-1', \"erpNativeKod\"='KOD-TEST-1', \"erpSyncAttempts\"=2, \"erpLastErrorCode\"='TIMEOUT', \"erpLastErrorMessage\"='verify', \"erpLastSyncAt\"=NOW() WHERE id='$ORDER_ID';" >/dev/null
  RT_STATUS=$(psqlq "SELECT \"erpSyncStatus\" FROM \"Order\" WHERE id='$ORDER_ID';")
  RT_NID=$(psqlq "SELECT \"erpNativeId\" FROM \"Order\" WHERE id='$ORDER_ID';")
  RT_NKOD=$(psqlq "SELECT \"erpNativeKod\" FROM \"Order\" WHERE id='$ORDER_ID';")
  RT_CORR=$(psqlq "SELECT COALESCE(\"externalErpId\",'') FROM \"Order\" WHERE id='$ORDER_ID';")
  RT_OST=$(psqlq "SELECT status FROM \"Order\" WHERE id='$ORDER_ID';")

  if [[ "$RT_STATUS" == "PENDING_ERP" ]]; then ok "erpSyncStatus round-trip"; else bad "erpSyncStatus=$RT_STATUS"; fi
  if [[ "$RT_NID" == "native-test-1" && "$RT_CORR" == "$BEFORE_CORR" ]]; then
    ok "erpNativeId independent from externalErpId"
  else
    bad "erpNativeId/correlation coupling nid=$RT_NID corr=$RT_CORR before=$BEFORE_CORR"
  fi
  if [[ "$RT_NKOD" == "KOD-TEST-1" && "$RT_CORR" == "$BEFORE_CORR" ]]; then
    ok "erpNativeKod independent from externalErpId"
  else
    bad "erpNativeKod/correlation coupling"
  fi
  if [[ "$RT_OST" == "$BEFORE_STATUS" ]]; then
    ok "order.status unchanged by erp sync field writes"
  else
    bad "order.status changed $BEFORE_STATUS → $RT_OST"
  fi

  # restore test mutation on sync fields only
  psqlq "UPDATE \"Order\" SET \"erpSyncStatus\"=CASE WHEN COALESCE(TRIM(\"externalErpId\"),'')<>'' THEN 'SYNCED' ELSE NULL END, \"erpNativeId\"=NULL, \"erpNativeKod\"=NULL, \"erpSyncAttempts\"=0, \"erpLastErrorCode\"=NULL, \"erpLastErrorMessage\"=NULL WHERE id='$ORDER_ID';" >/dev/null
fi

# Backfill: legacy exports with externalErpId should be SYNCED; offline batch may add PENDING/FAILED.
BF_BAD=$(psqlq "SELECT COUNT(*) FROM \"Order\" WHERE \"externalErpId\" IS NOT NULL AND TRIM(\"externalErpId\")<>'' AND \"erpSyncStatus\" IS NULL;")
if [[ "$BF_BAD" == "0" ]]; then
  ok "backfill: externalErpId rows have erpSyncStatus set"
else
  bad "backfill incomplete: $BF_BAD rows with externalErpId but null erpSyncStatus"
fi

# Correlation format sample
CORR_SAMPLE=$(psqlq "SELECT \"externalErpId\" FROM \"Order\" WHERE \"externalErpId\" LIKE 'ext:GA:%' LIMIT 1;")
if [[ -n "$CORR_SAMPLE" ]]; then
  ok "existing ext:GA correlation still present ($CORR_SAMPLE)"
else
  ok "no ext:GA sample in DB (acceptable if Flexi never exported)"
fi

# Soft-fallback still SYNCED in code path (grep)
if docker exec green-angels-api sh -c "grep -B25 'exported without reservation' /app/src/flexi/flexi.service.ts | grep -q \"erpSyncStatus: 'SYNCED'\""; then
  ok "soft-fallback export still sets erpSyncStatus=SYNCED"
else
  bad "soft-fallback SYNCED write missing"
fi

# Checkout / REL-002 smoke (Flexi off)
FLEXI_BEFORE=$(docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "SELECT value FROM \"Settings\" WHERE key='integration.flexi' LIMIT 1;" | tr -d '\n' || true)
psqlq "UPDATE \"Settings\" SET value = ((COALESCE(NULLIF(value,''),'{}')::jsonb) || '{\"enabled\":false}'::jsonb)::text WHERE key='integration.flexi';" >/dev/null || true
restore_flexi() {
  if [[ -n "${FLEXI_BEFORE:-}" ]]; then
    docker exec green-angels-postgres psql -U green_angels -d green_angels -c "UPDATE \"Settings\" SET value = \$flexi\$ ${FLEXI_BEFORE} \$flexi\$ WHERE key='integration.flexi';" >/dev/null || true
  fi
}
trap restore_flexi EXIT

CURRENCY=$(psqlq "SELECT COALESCE((value::jsonb->>'defaultCurrency'),'UAH') FROM \"Settings\" WHERE key='commerce.market' LIMIT 1;")
VARIANT=$(psqlq "SELECT pv.id FROM \"ProductVariant\" pv JOIN \"Product\" p ON p.id = pv.\"productId\" JOIN \"ProductPrice\" pp ON pp.\"productVariantId\" = pv.id WHERE p.\"isPublished\" = true AND pp.value > 0 AND pp.currency = '$CURRENCY' ORDER BY pv.stock DESC LIMIT 1;")
if [[ -z "$VARIANT" ]]; then
  bad "no variant for checkout smoke"
else
  psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 20), \"availableFrom\" = NULL WHERE id='$VARIANT';" >/dev/null || true
  STOCK_BEFORE=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
  TS=$(date +%s)
  RAND=$(printf '%06d' $((RANDOM % 1000000)))
  ORDER_HTTP=$(curl -sS -o /tmp/erp-sync-order.json -w '%{http_code}' -X POST "$API/orders" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: erp-sync-$TS-$RAND" \
    -d "{
      \"items\": [{\"productVariantId\": \"$VARIANT\", \"quantity\": 1}],
      \"customerFirstName\": \"Erp\",
      \"customerLastName\": \"Sync\",
      \"customerPhone\": \"+380530$RAND\",
      \"customerEmail\": \"erp-sync-$TS@example.com\",
      \"receiverFirstName\": \"Erp\",
      \"receiverLastName\": \"Sync\",
      \"receiverPhone\": \"+380530$RAND\",
      \"deliveryMethod\": \"pickup\",
      \"paymentMethod\": \"bank-transfer\",
      \"privacyConsent\": true
    }")
  if [[ "$ORDER_HTTP" == "201" || "$ORDER_HTTP" == "200" ]]; then
    NEW_ID=$(json_get id </tmp/erp-sync-order.json)
    STOCK_AFTER=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT';")
    NEW_SYNC=$(psqlq "SELECT COALESCE(\"erpSyncStatus\",'NULL') FROM \"Order\" WHERE id='$NEW_ID';")
    NEW_STATUS=$(psqlq "SELECT status FROM \"Order\" WHERE id='$NEW_ID';")
    if [[ "$STOCK_AFTER" -eq $((STOCK_BEFORE - 1)) ]]; then
      ok "LOCAL checkout + REL-002 stock decrement unchanged ($STOCK_BEFORE → $STOCK_AFTER)"
    else
      bad "stock not decremented before=$STOCK_BEFORE after=$STOCK_AFTER"
    fi
    if [[ "$NEW_SYNC" == "NULL" || "$NEW_SYNC" == "NOT_REQUIRED" ]]; then
      ok "new order erpSyncStatus remains NOT_REQUIRED/null (no offline wiring)"
    else
      bad "new order unexpected erpSyncStatus=$NEW_SYNC"
    fi
    if [[ "$NEW_STATUS" != "PENDING_ERP" && "$NEW_STATUS" != "ERP_CONFLICT" && "$NEW_STATUS" != "SYNCED" ]]; then
      ok "order.status is not an ERP sync state ($NEW_STATUS)"
    else
      bad "order.status incorrectly set to ERP sync state: $NEW_STATUS"
    fi
  else
    bad "order create HTTP $ORDER_HTTP body=$(head -c 200 /tmp/erp-sync-order.json)"
  fi
fi

# Constants file present
if docker exec green-angels-api test -f /app/src/orders/erp-sync.constants.ts; then
  ok "erp-sync.constants.ts present"
else
  bad "erp-sync.constants.ts missing"
fi

# inventoryMode wired for EXTERNAL offline (ERP-OFFLINE-001)
if docker exec green-angels-api sh -c "grep -q 'isExternalInventoryMode' /app/src/orders/orders.service.ts"; then
  ok "orders.service reads inventoryMode (EXTERNAL offline path)"
else
  bad "isExternalInventoryMode not wired in orders.service"
fi

echo ""
echo "ERP-SYNC-001 results: PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
