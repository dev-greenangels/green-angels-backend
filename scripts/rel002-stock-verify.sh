#!/usr/bin/env bash
# REL-002 — conditional stock decrement / oversell protection
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

FLEXI_BEFORE=$(docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "SELECT value FROM \"Settings\" WHERE key='integration.flexi' LIMIT 1;" | tr -d '\n' || true)
psqlq "UPDATE \"Settings\" SET value = ((COALESCE(NULLIF(value,''),'{}')::jsonb) || '{\"enabled\":false}'::jsonb)::text WHERE key='integration.flexi';" >/dev/null || true
restore_flexi() {
  if [[ -n "${FLEXI_BEFORE:-}" ]]; then
    docker exec green-angels-postgres psql -U green_angels -d green_angels -c "UPDATE \"Settings\" SET value = \$flexi\$ ${FLEXI_BEFORE} \$flexi\$ WHERE key='integration.flexi';" >/dev/null || true
  fi
}
trap restore_flexi EXIT

CURRENCY=$(psqlq "SELECT COALESCE((value::jsonb->>'defaultCurrency'),'UAH') FROM \"Settings\" WHERE key='commerce.market' LIMIT 1;")
# Prefer two distinct priced variants for multi-line rollback tests.
VARIANT_A=$(psqlq "SELECT pv.id FROM \"ProductVariant\" pv JOIN \"Product\" p ON p.id = pv.\"productId\" JOIN \"ProductPrice\" pp ON pp.\"productVariantId\" = pv.id WHERE p.\"isPublished\" = true AND pp.value > 0 AND pp.currency = '$CURRENCY' ORDER BY pv.stock DESC LIMIT 1;")
VARIANT_B=$(psqlq "SELECT pv.id FROM \"ProductVariant\" pv JOIN \"Product\" p ON p.id = pv.\"productId\" JOIN \"ProductPrice\" pp ON pp.\"productVariantId\" = pv.id WHERE p.\"isPublished\" = true AND pp.value > 0 AND pp.currency = '$CURRENCY' AND pv.id <> '$VARIANT_A' ORDER BY pv.stock DESC LIMIT 1;")
if [[ -z "$VARIANT_A" ]]; then
  echo "No priced ProductVariant found"
  exit 1
fi
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 40), \"availableFrom\" = NULL WHERE id='$VARIANT_A';" >/dev/null || true
if [[ -n "$VARIANT_B" ]]; then
  psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 40), \"availableFrom\" = NULL WHERE id='$VARIANT_B';" >/dev/null || true
fi
echo "Using VARIANT_A=$VARIANT_A VARIANT_B=${VARIANT_B:-none} currency=$CURRENCY"

TS=$(date +%s)
RAND=$(printf '%06d' $((RANDOM % 1000000)))

order_body_one() {
  local email="$1"
  local phone="$2"
  local variant="$3"
  local qty="$4"
  cat <<EOF
{
  "items": [{"productVariantId": "$variant", "quantity": $qty}],
  "customerFirstName": "Stock",
  "customerLastName": "Test",
  "customerPhone": "$phone",
  "customerEmail": "$email",
  "receiverFirstName": "Stock",
  "receiverLastName": "Test",
  "receiverPhone": "$phone",
  "deliveryMethod": "pickup",
  "paymentMethod": "bank-transfer",
  "privacyConsent": true
}
EOF
}

order_body_two() {
  local email="$1"
  local phone="$2"
  local v1="$3"
  local q1="$4"
  local v2="$5"
  local q2="$6"
  cat <<EOF
{
  "items": [
    {"productVariantId": "$v1", "quantity": $q1},
    {"productVariantId": "$v2", "quantity": $q2}
  ],
  "customerFirstName": "Stock",
  "customerLastName": "Multi",
  "customerPhone": "$phone",
  "customerEmail": "$email",
  "receiverFirstName": "Stock",
  "receiverLastName": "Multi",
  "receiverPhone": "$phone",
  "deliveryMethod": "pickup",
  "paymentMethod": "bank-transfer",
  "privacyConsent": true
}
EOF
}

create_one() {
  local key="$1"
  local email="$2"
  local phone="$3"
  local variant="$4"
  local qty="$5"
  local out="${6:-/tmp/rel002-out.json}"
  curl -sS -o "$out" -w '%{http_code}' -X POST "$API/orders" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: $key" \
    -d "$(order_body_one "$email" "$phone" "$variant" "$qty")"
}

echo "=== CASE 1 Stock=1, two concurrent qty=1 → exactly one success ==="
psqlq "UPDATE \"ProductVariant\" SET stock = 1 WHERE id='$VARIANT_A';" >/dev/null
EMAIL1A="rel002-1a-${TS}@example.com"
EMAIL1B="rel002-1b-${TS}@example.com"
PHONE1="+421930${RAND}"
create_one "rel002-1a-${TS}" "$EMAIL1A" "$PHONE1" "$VARIANT_A" 1 /tmp/rel002-1a.json >/tmp/rel002-1a.code &
PID1A=$!
create_one "rel002-1b-${TS}" "$EMAIL1B" "$PHONE1" "$VARIANT_A" 1 /tmp/rel002-1b.json >/tmp/rel002-1b.code &
PID1B=$!
wait "$PID1A" "$PID1B" || true
C1A=$(tr -d '[:space:]' </tmp/rel002-1a.code)
C1B=$(tr -d '[:space:]' </tmp/rel002-1b.code)
STOCK1=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_A';")
OK_COUNT=0
FAIL_COUNT=0
for c in "$C1A" "$C1B"; do
  if [[ "$c" == "200" || "$c" == "201" ]]; then OK_COUNT=$((OK_COUNT + 1)); else FAIL_COUNT=$((FAIL_COUNT + 1)); fi
done
NEG1=$(psqlq "SELECT count(*) FROM \"ProductVariant\" WHERE id='$VARIANT_A' AND stock < 0;")
if [[ "$OK_COUNT" == "1" && "$FAIL_COUNT" == "1" && "$STOCK1" == "0" && "$NEG1" == "0" ]]; then
  ok "1 last-unit race → one win, stock=0 (codes=$C1A/$C1B)"
else
  bad "1 (codes=$C1A/$C1B ok=$OK_COUNT fail=$FAIL_COUNT stock=$STOCK1 neg=$NEG1)"
fi

echo "=== CASE 2 Stock=5, five concurrent qty=1 → all succeed, stock=0 ==="
psqlq "UPDATE \"ProductVariant\" SET stock = 5 WHERE id='$VARIANT_A';" >/dev/null
PIDS=()
for i in 1 2 3 4 5; do
  create_one "rel002-2-${TS}-$i" "rel002-2${i}-${TS}@example.com" "+421931${RAND}" "$VARIANT_A" 1 "/tmp/rel002-2-$i.json" >"/tmp/rel002-2-$i.code" &
  PIDS+=($!)
done
for p in "${PIDS[@]}"; do wait "$p" || true; done
OK2=0
for i in 1 2 3 4 5; do
  c=$(tr -d '[:space:]' <"/tmp/rel002-2-$i.code")
  if [[ "$c" == "200" || "$c" == "201" ]]; then OK2=$((OK2 + 1)); fi
done
STOCK2=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_A';")
if [[ "$OK2" == "5" && "$STOCK2" == "0" ]]; then
  ok "2 five concurrent qty=1 on stock=5 → 5 orders, stock=0"
else
  bad "2 (ok=$OK2 stock=$STOCK2)"
fi

echo "=== CASE 3 Stock=5, qty=6 → fail, stock unchanged ==="
psqlq "UPDATE \"ProductVariant\" SET stock = 5 WHERE id='$VARIANT_A';" >/dev/null
HTTP3=$(create_one "rel002-3-${TS}" "rel002-3-${TS}@example.com" "+421932${RAND}" "$VARIANT_A" 6 /tmp/rel002-3.json)
STOCK3=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_A';")
if [[ "$HTTP3" != "200" && "$HTTP3" != "201" && "$STOCK3" == "5" ]]; then
  ok "3 qty>stock fails, stock remains 5 (http=$HTTP3)"
else
  bad "3 (http=$HTTP3 stock=$STOCK3 body=$(head -c 120 /tmp/rel002-3.json))"
fi

echo "=== CASE 4 Stock=0, qty=1 → fail, stock stays 0 ==="
psqlq "UPDATE \"ProductVariant\" SET stock = 0, \"availableFrom\" = NULL WHERE id='$VARIANT_A';" >/dev/null
HTTP4=$(create_one "rel002-4-${TS}" "rel002-4-${TS}@example.com" "+421933${RAND}" "$VARIANT_A" 1 /tmp/rel002-4.json)
STOCK4=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_A';")
if [[ "$HTTP4" != "200" && "$HTTP4" != "201" && "$STOCK4" == "0" ]]; then
  ok "4 stock=0 fails, remains 0 (http=$HTTP4)"
else
  bad "4 (http=$HTTP4 stock=$STOCK4)"
fi

echo "=== CASE 5 REL-001: same key does not double-decrement ==="
psqlq "UPDATE \"ProductVariant\" SET stock = 3 WHERE id='$VARIANT_A';" >/dev/null
KEY5="rel002-idem-${TS}"
EMAIL5="rel002-5-${TS}@example.com"
PHONE5="+421934${RAND}"
HTTP5A=$(create_one "$KEY5" "$EMAIL5" "$PHONE5" "$VARIANT_A" 1 /tmp/rel002-5a.json)
OID5=$(json_get id </tmp/rel002-5a.json || true)
STOCK5A=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_A';")
HTTP5B=$(create_one "$KEY5" "$EMAIL5" "$PHONE5" "$VARIANT_A" 1 /tmp/rel002-5b.json)
OID5B=$(json_get id </tmp/rel002-5b.json || true)
STOCK5B=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_A';")
DUP5=$(psqlq "SELECT count(*) FROM \"Order\" WHERE \"customerEmail\"='$EMAIL5';")
if [[ ( "$HTTP5A" == "200" || "$HTTP5A" == "201" ) && "$OID5" == "$OID5B" && "$STOCK5A" == "2" && "$STOCK5B" == "2" && "$DUP5" == "1" ]]; then
  ok "5 idempotent replay → same order, stock decremented once"
else
  bad "5 (http=$HTTP5A/$HTTP5B oid=$OID5/$OID5B stock=$STOCK5A/$STOCK5B dup=$DUP5)"
fi

echo "=== CASE 6 Two keys compete for last unit ==="
psqlq "UPDATE \"ProductVariant\" SET stock = 1 WHERE id='$VARIANT_A';" >/dev/null
create_one "rel002-6a-${TS}" "rel002-6a-${TS}@example.com" "+421935${RAND}" "$VARIANT_A" 1 /tmp/rel002-6a.json >/tmp/rel002-6a.code &
create_one "rel002-6b-${TS}" "rel002-6b-${TS}@example.com" "+421935${RAND}" "$VARIANT_A" 1 /tmp/rel002-6b.json >/tmp/rel002-6b.code &
wait || true
C6A=$(tr -d '[:space:]' </tmp/rel002-6a.code)
C6B=$(tr -d '[:space:]' </tmp/rel002-6b.code)
STOCK6=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_A';")
OK6=0
for c in "$C6A" "$C6B"; do
  if [[ "$c" == "200" || "$c" == "201" ]]; then OK6=$((OK6 + 1)); fi
done
if [[ "$OK6" == "1" && "$STOCK6" == "0" ]]; then
  ok "6 two keys / last unit → one order (codes=$C6A/$C6B)"
else
  bad "6 (codes=$C6A/$C6B ok=$OK6 stock=$STOCK6)"
fi

echo "=== CASE 7 Multi-line: insufficient line rolls back entire order ==="
if [[ -z "$VARIANT_B" || "$VARIANT_B" == "$VARIANT_A" ]]; then
  bad "7 skipped — need second variant"
else
  psqlq "UPDATE \"ProductVariant\" SET stock = 0, \"availableFrom\" = NULL WHERE id='$VARIANT_A';" >/dev/null
  psqlq "UPDATE \"ProductVariant\" SET stock = 10 WHERE id='$VARIANT_B';" >/dev/null
  STOCK_B_BEFORE=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_B';")
  EMAIL7="rel002-7-${TS}@example.com"
  PHONE7="+421936${RAND}"
  HTTP7=$(curl -sS -o /tmp/rel002-7.json -w '%{http_code}' -X POST "$API/orders" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: rel002-7-${TS}" \
    -d "$(order_body_two "$EMAIL7" "$PHONE7" "$VARIANT_A" 1 "$VARIANT_B" 1)")
  STOCK_A7=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_A';")
  STOCK_B7=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_B';")
  ORD7=$(psqlq "SELECT count(*) FROM \"Order\" WHERE \"customerEmail\"='$EMAIL7';")
  if [[ "$HTTP7" != "200" && "$HTTP7" != "201" && "$STOCK_A7" == "0" && "$STOCK_B7" == "$STOCK_B_BEFORE" && "$ORD7" == "0" ]]; then
    ok "7 multi-line insufficient → no order, B stock unchanged ($STOCK_B7)"
  else
    bad "7 (http=$HTTP7 stockA=$STOCK_A7 stockB=$STOCK_B7/$STOCK_B_BEFORE ord=$ORD7 body=$(head -c 140 /tmp/rel002-7.json))"
  fi
fi

echo "=== CASE 8 Stock never negative after oversell attempt ==="
psqlq "UPDATE \"ProductVariant\" SET stock = 2 WHERE id='$VARIANT_A';" >/dev/null
PIDS8=()
for i in 1 2 3 4; do
  create_one "rel002-8-${TS}-$i" "rel002-8${i}-${TS}@example.com" "+421937${RAND}" "$VARIANT_A" 1 "/tmp/rel002-8-$i.json" >"/tmp/rel002-8-$i.code" &
  PIDS8+=($!)
done
for p in "${PIDS8[@]}"; do wait "$p" || true; done
STOCK8=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_A';")
NEG8=$(psqlq "SELECT count(*) FROM \"ProductVariant\" WHERE id='$VARIANT_A' AND stock < 0;")
OK8=0
for i in 1 2 3 4; do
  c=$(tr -d '[:space:]' <"/tmp/rel002-8-$i.code")
  if [[ "$c" == "200" || "$c" == "201" ]]; then OK8=$((OK8 + 1)); fi
done
if [[ "$OK8" == "2" && "$STOCK8" == "0" && "$NEG8" == "0" ]]; then
  ok "8 four concurrent on stock=2 → 2 wins, never negative"
else
  bad "8 (ok=$OK8 stock=$STOCK8 neg=$NEG8)"
fi

# Restore usable stock for other scripts
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 40) WHERE id='$VARIANT_A';" >/dev/null || true
if [[ -n "$VARIANT_B" ]]; then
  psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 40) WHERE id='$VARIANT_B';" >/dev/null || true
fi

echo ""
echo "REL-002 results: PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
exit 0
