#!/usr/bin/env bash
# REL-001 — order create idempotency verification
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

VARIANT_ID=$(psqlq "SELECT pv.id FROM \"ProductVariant\" pv JOIN \"Product\" p ON p.id = pv.\"productId\" JOIN \"ProductPrice\" pp ON pp.\"productVariantId\" = pv.id WHERE p.\"isPublished\" = true AND pv.stock >= 20 AND pp.value > 0 AND pp.currency = (SELECT COALESCE((value::jsonb->>'defaultCurrency'),'UAH') FROM \"Settings\" WHERE key='commerce.market' LIMIT 1) LIMIT 1;")
if [[ -z "$VARIANT_ID" ]]; then
  echo "No suitable ProductVariant found"
  exit 1
fi
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 40) WHERE id='$VARIANT_ID';" >/dev/null || true
echo "Using variant: $VARIANT_ID"

TS=$(date +%s)
RAND=$(printf '%06d' $((RANDOM % 1000000)))

order_body() {
  local email="$1"
  local phone="$2"
  local qty="${3:-1}"
  cat <<EOF
{
  "items": [{"productVariantId": "$VARIANT_ID", "quantity": $qty}],
  "customerFirstName": "Idem",
  "customerLastName": "Test",
  "customerPhone": "$phone",
  "customerEmail": "$email",
  "receiverFirstName": "Idem",
  "receiverLastName": "Test",
  "receiverPhone": "$phone",
  "deliveryMethod": "pickup",
  "paymentMethod": "bank-transfer",
  "privacyConsent": true
}
EOF
}

create_order() {
  local key="$1"
  local email="$2"
  local phone="$3"
  local out="${4:-/tmp/rel001-out.json}"
  local qty="${5:-1}"
  curl -sS -o "$out" -w '%{http_code}' -X POST "$API/orders" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: $key" \
    -d "$(order_body "$email" "$phone" "$qty")"
}

sign_customer_jwt() {
  local uid="$1"
  docker exec green-angels-api node -e "
const jwt=require('jsonwebtoken');
const secret=process.env.JWT_SECRET;
process.stdout.write(jwt.sign({ role: 'customer', v: 1 }, secret, { subject: process.argv[1], expiresIn: '1h' }));
" "$uid"
}

EMAIL1="rel001-a-${TS}@example.com"
PHONE1="+421920${RAND}"
KEY1="rel001-key-${TS}-a"

echo "=== CASE 1+2 Same key → one order; replay returns same id ==="
STOCK_BEFORE=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_ID';")
HTTP1=$(create_order "$KEY1" "$EMAIL1" "$PHONE1" /tmp/rel001-1.json)
OID1=$(json_get id </tmp/rel001-1.json || true)
ONUM1=$(json_get orderNumber </tmp/rel001-1.json || true)
HTTP2=$(create_order "$KEY1" "$EMAIL1" "$PHONE1" /tmp/rel001-2.json)
OID2=$(json_get id </tmp/rel001-2.json || true)
STOCK_AFTER=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_ID';")
COUNT=$(psqlq "SELECT count(*) FROM \"Order\" WHERE id='$OID1' OR \"customerEmail\"='$EMAIL1';")
# count orders with this email created in this test window — prefer exact id match
DUP=$(psqlq "SELECT count(*) FROM \"Order\" WHERE \"customerEmail\"='$EMAIL1';")
STOCK_DELTA=$((STOCK_BEFORE - STOCK_AFTER))
if [[ ( "$HTTP1" == "200" || "$HTTP1" == "201" ) && ( "$HTTP2" == "200" || "$HTTP2" == "201" ) && "$OID1" == "$OID2" && -n "$OID1" && "$DUP" == "1" ]]; then
  ok "1–2 same key replay → same order ($OID1)"
else
  bad "1–2 (http=$HTTP1/$HTTP2 oid=$OID1/$OID2 dup=$DUP)"
fi

echo "=== CASE 4 Stock decremented once ==="
if [[ "$STOCK_DELTA" == "1" ]]; then
  ok "4 stock decremented once (delta=$STOCK_DELTA)"
else
  bad "4 stock delta=$STOCK_DELTA (before=$STOCK_BEFORE after=$STOCK_AFTER)"
fi

echo "=== CASE 3 Concurrent same key → exactly one order ==="
EMAIL3="rel001-c-${TS}@example.com"
PHONE3="+421921${RAND}"
KEY3="rel001-key-${TS}-c"
STOCK3B=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_ID';")
create_order "$KEY3" "$EMAIL3" "$PHONE3" /tmp/rel001-3a.json >/tmp/rel001-3a.code &
PID_A=$!
create_order "$KEY3" "$EMAIL3" "$PHONE3" /tmp/rel001-3b.json >/tmp/rel001-3b.code &
PID_B=$!
wait "$PID_A" "$PID_B" || true
CODE_A=$(tr -d '[:space:]' </tmp/rel001-3a.code)
CODE_B=$(tr -d '[:space:]' </tmp/rel001-3b.code)
OID_A=$(json_get id </tmp/rel001-3a.json 2>/dev/null || true)
OID_B=$(json_get id </tmp/rel001-3b.json 2>/dev/null || true)
DUP3=$(psqlq "SELECT count(*) FROM \"Order\" WHERE \"customerEmail\"='$EMAIL3';")
STOCK3A=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_ID';")
DELTA3=$((STOCK3B - STOCK3A))
# Both should succeed with same id, or one 409 + one success with single order
SAME_OK=0
if [[ -n "$OID_A" && "$OID_A" == "$OID_B" && "$DUP3" == "1" && "$DELTA3" == "1" ]]; then
  SAME_OK=1
fi
if [[ "$SAME_OK" -eq 1 ]]; then
  ok "3 concurrent same key → one order (codes=$CODE_A/$CODE_B)"
else
  # Accept: one success + one 409, still one DB row
  if [[ "$DUP3" == "1" && "$DELTA3" == "1" ]] && \
     { [[ "$CODE_A" == "201" || "$CODE_A" == "200" ]] || [[ "$CODE_B" == "201" || "$CODE_B" == "200" ]]; }; then
    ok "3 concurrent same key → one order (codes=$CODE_A/$CODE_B, 409 tolerated)"
  else
    bad "3 (codes=$CODE_A/$CODE_B oids=$OID_A/$OID_B dup=$DUP3 delta=$DELTA3)"
  fi
fi

echo "=== CASE 5 Different key → separate order ==="
EMAIL5="rel001-e-${TS}@example.com"
PHONE5="+421922${RAND}"
KEY5A="rel001-key-${TS}-e1"
KEY5B="rel001-key-${TS}-e2"
HTTP5A=$(create_order "$KEY5A" "$EMAIL5" "$PHONE5" /tmp/rel001-5a.json)
OID5A=$(json_get id </tmp/rel001-5a.json || true)
# second order needs different email for uniqueness of assertion — same customer email would still create 2 orders
EMAIL5B="rel001-e2-${TS}@example.com"
HTTP5B=$(create_order "$KEY5B" "$EMAIL5B" "$PHONE5" /tmp/rel001-5b.json)
OID5B=$(json_get id </tmp/rel001-5b.json || true)
if [[ -n "$OID5A" && -n "$OID5B" && "$OID5A" != "$OID5B" ]]; then
  ok "5 different keys → different orders"
else
  bad "5 (http=$HTTP5A/$HTTP5B oid=$OID5A/$OID5B)"
fi

echo "=== CASE 6 Same key + different context → 409, no cross-order leak ==="
EMAIL6="rel001-f-${TS}@example.com"
PHONE6="+421923${RAND}"
KEY6="rel001-key-${TS}-f"
HTTP6A=$(create_order "$KEY6" "$EMAIL6" "$PHONE6" /tmp/rel001-6a.json)
OID6A=$(json_get id </tmp/rel001-6a.json || true)
EMAIL6B="rel001-f2-${TS}@example.com"
HTTP6B=$(create_order "$KEY6" "$EMAIL6B" "$PHONE6" /tmp/rel001-6b.json)
OID6B=$(json_get id </tmp/rel001-6b.json 2>/dev/null || true)
DUP6=$(psqlq "SELECT count(*) FROM \"Order\" WHERE \"customerEmail\" IN ('$EMAIL6','$EMAIL6B')")
# Must not return OID6A to the mismatched request
if [[ ( "$HTTP6A" == "200" || "$HTTP6A" == "201" ) && "$HTTP6B" == "409" && "$DUP6" == "1" && ( -z "$OID6B" || "$OID6B" != "$OID6A" ) ]]; then
  ok "6 key misuse → 409, no second order / no leak"
else
  bad "6 (http=$HTTP6A/$HTTP6B oid=$OID6A/$OID6B dup=$DUP6 body=$(head -c 120 /tmp/rel001-6b.json))"
fi

echo "=== CASE 6b Auth context: same key + different session → 409 ==="
USER_A=$(psqlq "INSERT INTO \"User\" (id, email, \"emailVerified\", phone, \"phoneVerified\", \"firstName\", \"lastName\", role, newsletter, optin, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'rel001-ua-${TS}@example.com', true, null, false, 'A', 'User', 'USER', false, false, NOW(), NOW()) RETURNING id;")
USER_B=$(psqlq "INSERT INTO \"User\" (id, email, \"emailVerified\", phone, \"phoneVerified\", \"firstName\", \"lastName\", role, newsletter, optin, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'rel001-ub-${TS}@example.com', true, null, false, 'B', 'User', 'USER', false, false, NOW(), NOW()) RETURNING id;")
TOKEN_A=$(sign_customer_jwt "$USER_A")
TOKEN_B=$(sign_customer_jwt "$USER_B")
KEY6B="rel001-key-${TS}-auth"
EMAIL_AUTH="rel001-auth-${TS}@example.com"
PHONE_AUTH="+421924${RAND}"
BODY_AUTH=$(order_body "$EMAIL_AUTH" "$PHONE_AUTH" 1)
HTTP_A=$(curl -sS -o /tmp/rel001-auth-a.json -w '%{http_code}' -X POST "$API/orders" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $KEY6B" -H "Authorization: Bearer $TOKEN_A" \
  -d "$BODY_AUTH")
OID_AUTH=$(json_get id </tmp/rel001-auth-a.json || true)
HTTP_B=$(curl -sS -o /tmp/rel001-auth-b.json -w '%{http_code}' -X POST "$API/orders" \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $KEY6B" -H "Authorization: Bearer $TOKEN_B" \
  -d "$BODY_AUTH")
OWNER=$(psqlq "SELECT coalesce(\"userId\"::text,'') FROM \"Order\" WHERE id='$OID_AUTH';")
if [[ ( "$HTTP_A" == "200" || "$HTTP_A" == "201" ) && "$HTTP_B" == "409" && "$OWNER" == "$USER_A" ]]; then
  ok "6b different session → 409; order stays with User A"
else
  bad "6b (http=$HTTP_A/$HTTP_B owner=$OWNER expected=$USER_A)"
fi

echo "=== CASE 7 Failed create does not poison key ==="
EMAIL7="rel001-g-${TS}@example.com"
PHONE7="+421925${RAND}"
KEY7="rel001-key-${TS}-g"
STOCK7=$(psqlq "SELECT stock FROM \"ProductVariant\" WHERE id='$VARIANT_ID';")
psqlq "UPDATE \"ProductVariant\" SET stock = 0 WHERE id='$VARIANT_ID';" >/dev/null
HTTP7F=$(create_order "$KEY7" "$EMAIL7" "$PHONE7" /tmp/rel001-7f.json)
psqlq "UPDATE \"ProductVariant\" SET stock = $STOCK7 WHERE id='$VARIANT_ID';" >/dev/null
HTTP7S=$(create_order "$KEY7" "$EMAIL7" "$PHONE7" /tmp/rel001-7s.json)
OID7=$(json_get id </tmp/rel001-7s.json || true)
DUP7=$(psqlq "SELECT count(*) FROM \"Order\" WHERE \"customerEmail\"='$EMAIL7';")
if [[ "$HTTP7F" != "200" && "$HTTP7F" != "201" && ( "$HTTP7S" == "200" || "$HTTP7S" == "201" ) && -n "$OID7" && "$DUP7" == "1" ]]; then
  ok "7 failed create → retry with same key succeeds"
else
  bad "7 (failHttp=$HTTP7F okHttp=$HTTP7S oid=$OID7 dup=$DUP7 bodyF=$(head -c 100 /tmp/rel001-7f.json))"
fi

echo "=== CASE 8 SEC-007 smoke: guest still orphan ==="
EMAIL8="rel001-guest-${TS}@example.com"
PHONE8="+421926${RAND}"
KEY8="rel001-key-${TS}-guest"
BEFORE_U=$(psqlq 'SELECT count(*) FROM "User";')
HTTP8=$(create_order "$KEY8" "$EMAIL8" "$PHONE8" /tmp/rel001-8.json)
OID8=$(json_get id </tmp/rel001-8.json || true)
UID8=$(psqlq "SELECT coalesce(\"userId\"::text,'') FROM \"Order\" WHERE id='$OID8';")
AFTER_U=$(psqlq 'SELECT count(*) FROM "User";')
if [[ ( "$HTTP8" == "200" || "$HTTP8" == "201" ) && "$UID8" == "" && "$BEFORE_U" == "$AFTER_U" ]]; then
  ok "8 guest create remains orphan (SEC-007)"
else
  bad "8 (http=$HTTP8 uid=$UID8 users $BEFORE_U->$AFTER_U)"
fi

echo ""
echo "REL-001 results: PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
exit 0
