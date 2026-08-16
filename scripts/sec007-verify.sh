#!/usr/bin/env bash
# SEC-007 verification matrix (Nest API on localhost:3001)
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

sign_customer_jwt() {
  local uid="$1"
  docker exec green-angels-api node -e "
const jwt=require('jsonwebtoken');
const secret=process.env.JWT_SECRET;
process.stdout.write(jwt.sign({ role: 'customer', v: 1 }, secret, { subject: process.argv[1], expiresIn: '1h' }));
" "$uid"
}

VARIANT_ID="${VARIANT_ID:-}"
if [[ -z "$VARIANT_ID" ]]; then
  VARIANT_ID=$(psqlq "SELECT pv.id FROM \"ProductVariant\" pv JOIN \"ProductPrice\" pp ON pp.\"productVariantId\" = pv.id WHERE pv.stock >= 5 AND pp.value > 0 AND pp.currency = (SELECT COALESCE((value::jsonb->>'defaultCurrency'),'UAH') FROM \"Settings\" WHERE key='commerce.market' LIMIT 1) LIMIT 1;")
fi
if [[ -z "$VARIANT_ID" ]]; then
  VARIANT_ID=$(psqlq "SELECT pv.id FROM \"ProductVariant\" pv JOIN \"ProductPrice\" pp ON pp.\"productVariantId\" = pv.id WHERE pv.stock >= 5 AND pp.value > 0 LIMIT 1;")
fi
if [[ -z "$VARIANT_ID" ]]; then
  echo "No in-stock ProductVariant with price found; cannot run order create tests."
  exit 1
fi
echo "Using variant: $VARIANT_ID"
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 40) WHERE id='$VARIANT_ID';" >/dev/null || true

EMAIL_NEW="sec007-guest-$(date +%s)@example.com"
PHONE_NEW="+380501$(printf '%06d' $((RANDOM % 1000000)))"
EMAIL_EXIST="sec007-exist-$(date +%s)@example.com"
PHONE_EXIST="+380502$(printf '%06d' $((RANDOM % 1000000)))"

USER_A=$(psqlq "INSERT INTO \"User\" (id, email, \"emailVerified\", phone, \"phoneVerified\", \"firstName\", \"lastName\", role, newsletter, optin, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$EMAIL_EXIST', true, null, false, 'Anna', 'Test', 'USER', false, false, NOW(), NOW()) RETURNING id;")
USER_B=$(psqlq "INSERT INTO \"User\" (id, email, \"emailVerified\", phone, \"phoneVerified\", \"firstName\", \"lastName\", role, newsletter, optin, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), null, false, '$PHONE_EXIST', true, 'Bohdan', 'Test', 'USER', false, false, NOW(), NOW()) RETURNING id;")
echo "Seeded USER_A=$USER_A USER_B=$USER_B"

make_order() {
  local email="$1"
  local phone="$2"
  local extra="${3:-}"
  curl -sS -X POST "$API/orders" \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: sec007-$(date +%s%N)-$RANDOM" \
    -d "{
      \"items\": [{\"productVariantId\": \"$VARIANT_ID\", \"quantity\": 1}],
      \"customerFirstName\": \"Guest\",
      \"customerLastName\": \"Buyer\",
      \"customerPhone\": \"$phone\",
      \"customerEmail\": \"$email\",
      \"receiverFirstName\": \"Guest\",
      \"receiverLastName\": \"Buyer\",
      \"receiverPhone\": \"$phone\",
      \"deliveryMethod\": \"pickup\",
      \"paymentMethod\": \"bank-transfer\",
      \"privacyConsent\": true
      $extra
    }"
}

echo "--- Guest: new email/phone → orphan, no User create ---"
BEFORE_USERS=$(psqlq 'SELECT count(*) FROM "User";')
RESP=$(make_order "$EMAIL_NEW" "$PHONE_NEW")
OID=$(printf '%s' "$RESP" | json_get id || true)
AFTER_USERS=$(psqlq 'SELECT count(*) FROM "User";')
DB_UID=$(psqlq "SELECT coalesce(\"userId\"::text,'') FROM \"Order\" WHERE id='$OID';")
if [[ -n "$OID" && -z "$DB_UID" && "$AFTER_USERS" == "$BEFORE_USERS" ]]; then
  ok "new guest → orphan order, no User created (order=$OID)"
else
  bad "new guest orphan/create (oid=$OID db_uid='$DB_UID' users $BEFORE_USERS→$AFTER_USERS resp=$(echo "$RESP" | head -c 200))"
fi

echo "--- Guest: existing email → no User mutation ---"
A_BEFORE=$(psqlq "SELECT coalesce(phone,'')||'|'||\"emailVerified\"::text FROM \"User\" WHERE id='$USER_A';")
RESP=$(make_order "$EMAIL_EXIST" "$PHONE_NEW")
OID2=$(printf '%s' "$RESP" | json_get id || true)
A_AFTER=$(psqlq "SELECT coalesce(phone,'')||'|'||\"emailVerified\"::text FROM \"User\" WHERE id='$USER_A';")
ATTACHED=$(psqlq "SELECT coalesce(\"userId\"::text,'') FROM \"Order\" WHERE id='$OID2';")
PHONE_ACC=$(psqlq "SELECT count(*) FROM \"Account\" WHERE \"userId\"='$USER_A' AND provider='PHONE';")
if [[ "$A_BEFORE" == "$A_AFTER" && -z "$ATTACHED" && "$PHONE_ACC" == "0" ]]; then
  ok "existing email → no mutation / no attach / no PHONE Account"
else
  bad "existing email mutation (before=$A_BEFORE after=$A_AFTER attach='$ATTACHED' phoneAcc=$PHONE_ACC)"
fi

echo "--- Guest: existing phone → no User mutation ---"
B_BEFORE=$(psqlq "SELECT coalesce(email,'')||'|'||\"phoneVerified\"::text FROM \"User\" WHERE id='$USER_B';")
RESP=$(make_order "sec007-ph-$(date +%s)@example.com" "$PHONE_EXIST")
OID3=$(printf '%s' "$RESP" | json_get id || true)
B_AFTER=$(psqlq "SELECT coalesce(email,'')||'|'||\"phoneVerified\"::text FROM \"User\" WHERE id='$USER_B';")
ATTACHED3=$(psqlq "SELECT coalesce(\"userId\"::text,'') FROM \"Order\" WHERE id='$OID3';")
if [[ "$B_BEFORE" == "$B_AFTER" && -z "$ATTACHED3" ]]; then
  ok "existing phone → no mutation / no attach"
else
  bad "existing phone mutation (before=$B_BEFORE after=$B_AFTER attach='$ATTACHED3')"
fi

echo "--- Guest: email A + phone B → no merge / no mutation ---"
A_PHONE_BEFORE=$(psqlq "SELECT coalesce(phone,'') FROM \"User\" WHERE id='$USER_A';")
B_EMAIL_BEFORE=$(psqlq "SELECT coalesce(email,'') FROM \"User\" WHERE id='$USER_B';")
RESP=$(make_order "$EMAIL_EXIST" "$PHONE_EXIST")
OID4=$(printf '%s' "$RESP" | json_get id || true)
A_PHONE_AFTER=$(psqlq "SELECT coalesce(phone,'') FROM \"User\" WHERE id='$USER_A';")
B_EMAIL_AFTER=$(psqlq "SELECT coalesce(email,'') FROM \"User\" WHERE id='$USER_B';")
ATTACHED4=$(psqlq "SELECT coalesce(\"userId\"::text,'') FROM \"Order\" WHERE id='$OID4';")
USER_COUNT=$(psqlq "SELECT count(*) FROM \"User\" WHERE id IN ('$USER_A','$USER_B');")
if [[ "$A_PHONE_BEFORE" == "$A_PHONE_AFTER" && "$B_EMAIL_BEFORE" == "$B_EMAIL_AFTER" && -z "$ATTACHED4" && "$USER_COUNT" == "2" ]]; then
  ok "email A + phone B → no merge / no mutation / orphan"
else
  bad "conflict case (A phone '$A_PHONE_BEFORE'→'$A_PHONE_AFTER' B email '$B_EMAIL_BEFORE'→'$B_EMAIL_AFTER' attach='$ATTACHED4' count=$USER_COUNT)"
fi

echo "--- createAccount flag does not create User ---"
BEFORE_USERS=$(psqlq 'SELECT count(*) FROM "User";')
RESP=$(make_order "sec007-ca-$(date +%s)@example.com" "+380504$(printf '%06d' $((RANDOM % 1000000)))" ', "createAccount": true')
OID5=$(printf '%s' "$RESP" | json_get id || true)
AFTER_USERS=$(psqlq 'SELECT count(*) FROM "User";')
ATTACHED5=$(psqlq "SELECT coalesce(\"userId\"::text,'') FROM \"Order\" WHERE id='$OID5';")
FLAG=$(psqlq "SELECT \"createAccountRequested\"::text FROM \"Order\" WHERE id='$OID5';")
if [[ "$BEFORE_USERS" == "$AFTER_USERS" && -z "$ATTACHED5" ]]; then
  ok "createAccount=true → still orphan, no User (flag=$FLAG)"
else
  bad "createAccount still creates/attaches (users $BEFORE_USERS→$AFTER_USERS attach='$ATTACHED5')"
fi

echo "--- Unauthenticated attach denied ---"
CODE=$(curl -sS -o /tmp/sec007-attach.json -w '%{http_code}' -X POST "$API/account/orders/$OID/attach")
if [[ "$CODE" == "401" ]]; then
  ok "unauthenticated attach → 401"
else
  bad "unauthenticated attach expected 401 got $CODE body=$(head -c 120 /tmp/sec007-attach.json)"
fi

echo "--- Attach with session (verified email) ---"
TOKEN=$(sign_customer_jwt "$USER_A")
CODE2=$(curl -sS -o /tmp/sec007-attach2.json -w '%{http_code}' -X POST "$API/account/orders/$OID2/attach" \
  -H "Authorization: Bearer $TOKEN")
ATTACHED_OK=$(psqlq "SELECT coalesce(\"userId\"::text,'') FROM \"Order\" WHERE id='$OID2';")
if [[ "$CODE2" == "200" || "$CODE2" == "201" ]] && [[ "$ATTACHED_OK" == "$USER_A" ]]; then
  ok "verified session attach orphan → User A (http=$CODE2)"
else
  bad "attach orphan (http=$CODE2 body=$(head -c 200 /tmp/sec007-attach2.json) attached='$ATTACHED_OK')"
fi

echo "--- Cannot attach already-owned order ---"
CODE3=$(curl -sS -o /tmp/sec007-attach3.json -w '%{http_code}' -X POST "$API/account/orders/$OID2/attach" \
  -H "Authorization: Bearer $TOKEN")
if [[ "$CODE3" == "400" || "$CODE3" == "403" ]]; then
  ok "re-attach owned/same → rejected ($CODE3)"
else
  bad "re-attach expected 400/403 got $CODE3"
fi

TOKEN_B=$(sign_customer_jwt "$USER_B")
CODE4=$(curl -sS -o /tmp/sec007-attach4.json -w '%{http_code}' -X POST "$API/account/orders/$OID2/attach" \
  -H "Authorization: Bearer $TOKEN_B")
if [[ "$CODE4" == "403" || "$CODE4" == "400" ]]; then
  ok "User B cannot attach User A order ($CODE4)"
else
  bad "cross-user attach expected 403/400 got $CODE4 body=$(head -c 160 /tmp/sec007-attach4.json)"
fi

echo "--- Phone verified attach ---"
TOKEN_B2=$(sign_customer_jwt "$USER_B")
CODE_PH=$(curl -sS -o /tmp/sec007-attach-ph.json -w '%{http_code}' -X POST "$API/account/orders/$OID3/attach" \
  -H "Authorization: Bearer $TOKEN_B2")
ATTACHED_PH=$(psqlq "SELECT coalesce(\"userId\"::text,'') FROM \"Order\" WHERE id='$OID3';")
if [[ "$CODE_PH" == "200" || "$CODE_PH" == "201" ]] && [[ "$ATTACHED_PH" == "$USER_B" ]]; then
  ok "verified phone session attach orphan → User B (http=$CODE_PH)"
else
  bad "phone attach (http=$CODE_PH body=$(head -c 200 /tmp/sec007-attach-ph.json) attached='$ATTACHED_PH')"
fi

echo "--- Logged-in checkout uses sessionUserId ---"
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 40) WHERE id='$VARIANT_ID';" >/dev/null || true
TOKEN_A2=$(sign_customer_jwt "$USER_A")
RESP=$(curl -sS -X POST "$API/orders" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN_A2" \
  -H "Idempotency-Key: sec007-sess-$(date +%s%N)" \
  -d "{
    \"items\": [{\"productVariantId\": \"$VARIANT_ID\", \"quantity\": 1}],
    \"customerFirstName\": \"Other\",
    \"customerLastName\": \"Name\",
    \"customerPhone\": \"+380509998877\",
    \"customerEmail\": \"other-session-$(date +%s)@example.com\",
    \"receiverFirstName\": \"Other\",
    \"receiverLastName\": \"Name\",
    \"receiverPhone\": \"+380509998877\",
    \"deliveryMethod\": \"pickup\",
    \"paymentMethod\": \"bank-transfer\",
    \"privacyConsent\": true
  }")
OID6=$(printf '%s' "$RESP" | json_get id || true)
ATTACHED6=$(psqlq "SELECT coalesce(\"userId\"::text,'') FROM \"Order\" WHERE id='$OID6';")
A_PHONE=$(psqlq "SELECT coalesce(phone,'') FROM \"User\" WHERE id='$USER_A';")
if [[ "$ATTACHED6" == "$USER_A" && -z "$A_PHONE" ]]; then
  ok "logged-in create → session User; PII does not plant phone"
else
  bad "logged-in create (oid=$OID6 attach='$ATTACHED6' phone='$A_PHONE' resp=$(echo "$RESP" | head -c 160))"
fi

echo
echo "SEC-007 results: PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
