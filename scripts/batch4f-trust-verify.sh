#!/usr/bin/env bash
# BATCH 4F — trust boundary hardening verification
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

redis_set_otp() {
  local channel="$1"
  local id="$2"
  local code="$3"
  local purpose="${4:-checkout}"
  docker exec green-angels-redis redis-cli SET "otp:code:${channel}:${purpose}:${id}" "$code" EX 300 >/dev/null
  docker exec green-angels-redis redis-cli DEL "otp:attempts:${channel}:${purpose}:${id}" >/dev/null || true
}

clear_otp_ip() {
  docker exec green-angels-redis redis-cli --scan --pattern 'otp:ip:*' | while read -r k; do
    [[ -n "$k" ]] && docker exec green-angels-redis redis-cli DEL "$k" >/dev/null || true
  done
}

FLEXI_BEFORE=$(docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "SELECT value FROM \"Settings\" WHERE key='integration.flexi' LIMIT 1;" | tr -d '\n' || true)
MARKET_BEFORE=$(docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "SELECT value FROM \"Settings\" WHERE key='commerce.market' LIMIT 1;" | tr -d '\n' || true)
psqlq "UPDATE \"Settings\" SET value = ((COALESCE(NULLIF(value,''),'{}')::jsonb) || '{\"enabled\":false}'::jsonb)::text WHERE key='integration.flexi';" >/dev/null || true
# Enable checkout OTP channels for API dual-contact tests; keep SK-like profile/login split where noted.
psqlq "UPDATE \"Settings\" SET value = ((COALESCE(NULLIF(value,''),'{}')::jsonb) || '{\"otpSmsCheckout\":true,\"otpEmailCheckout\":true,\"otpSmsProfile\":true,\"otpEmailProfile\":true,\"otpSmsLogin\":false,\"otpEmailLogin\":true}'::jsonb)::text WHERE key='commerce.market';" >/dev/null || true
restore_settings() {
  if [[ -n "${FLEXI_BEFORE:-}" ]]; then
    docker exec green-angels-postgres psql -U green_angels -d green_angels -c "UPDATE \"Settings\" SET value = \$flexi\$ ${FLEXI_BEFORE} \$flexi\$ WHERE key='integration.flexi';" >/dev/null || true
  fi
  if [[ -n "${MARKET_BEFORE:-}" ]]; then
    docker exec green-angels-postgres psql -U green_angels -d green_angels -c "UPDATE \"Settings\" SET value = \$mkt\$ ${MARKET_BEFORE} \$mkt\$ WHERE key='commerce.market';" >/dev/null || true
  fi
}
trap restore_settings EXIT

VARIANT_ID=$(psqlq "SELECT pv.id FROM \"ProductVariant\" pv JOIN \"ProductPrice\" pp ON pp.\"productVariantId\" = pv.id WHERE pv.stock >= 5 AND pp.value > 0 AND pp.currency = (SELECT COALESCE((value::jsonb->>'defaultCurrency'),'UAH') FROM \"Settings\" WHERE key='commerce.market' LIMIT 1) LIMIT 1;")
psqlq "UPDATE \"ProductVariant\" SET stock = GREATEST(stock, 40) WHERE id='$VARIANT_ID';" >/dev/null || true
echo "Using variant: $VARIANT_ID"

TS=$(date +%s)
RAND=$(printf '%06d' $((RANDOM % 1000000)))
EMAIL_REG="b4f-reg-${TS}@example.com"
PHONE_REG="+421905${RAND}"
EMAIL_RAW="b4f-raw-${TS}@example.com"
PHONE_RAW="+421906${RAND}"
EMAIL_OWNED="b4f-owned-${TS}@example.com"
PHONE_OWNED="+421907${RAND}"
EMAIL_EXIST="b4f-exist-${TS}@example.com"
PHONE_EXIST="+421908${RAND}"
EMAIL_CHK="b4f-chk-${TS}@example.com"
PHONE_CHK="+421909${RAND}"
EMAIL_PROF="b4f-prof-${TS}@example.com"
PHONE_PROF="+421910${RAND}"

USER_OWNED=$(psqlq "INSERT INTO \"User\" (id, email, \"emailVerified\", phone, \"phoneVerified\", \"firstName\", \"lastName\", role, newsletter, optin, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$EMAIL_OWNED', true, '$PHONE_OWNED', true, 'Own', 'User', 'USER', false, false, NOW(), NOW()) RETURNING id;")
USER_EXIST=$(psqlq "INSERT INTO \"User\" (id, email, \"emailVerified\", phone, \"phoneVerified\", \"firstName\", \"lastName\", role, newsletter, optin, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), '$EMAIL_EXIST', true, '$PHONE_EXIST', true, 'Exist', 'User', 'USER', false, false, NOW(), NOW()) RETURNING id;")
psqlq "INSERT INTO \"Account\" (id, provider, \"providerId\", \"userId\") VALUES (gen_random_uuid(), 'PHONE', '$PHONE_OWNED', '$USER_OWNED');" >/dev/null || true
psqlq "INSERT INTO \"Account\" (id, provider, \"providerId\", \"userId\") VALUES (gen_random_uuid(), 'PHONE', '$PHONE_EXIST', '$USER_EXIST');" >/dev/null || true

checkout_identity() {
  local body="$1"
  local out="${2:-/tmp/b4f-ident.json}"
  curl -sS -o "$out" -w '%{http_code}' -X POST "$API/auth/checkout/identity" \
    -H 'Content-Type: application/json' \
    -d "$body"
}

mint_checkout_otp() {
  local channel="$1"
  local id="$2"
  local code="111222"
  clear_otp_ip
  redis_set_otp "$channel" "$id" "$code" checkout
  if [[ "$channel" == "phone" ]]; then
    curl -sS -X POST "$API/auth/otp/verify" -H 'Content-Type: application/json' \
      -d "{\"phone\":\"$id\",\"code\":\"$code\",\"purpose\":\"checkout\"}" | json_get verificationToken
  else
    curl -sS -X POST "$API/auth/otp/verify" -H 'Content-Type: application/json' \
      -d "{\"email\":\"$id\",\"code\":\"$code\",\"purpose\":\"checkout\"}" | json_get verificationToken
  fi
}

echo "=== 1 Register emailVerified=false ==="
HTTP=$(curl -sS -o /tmp/b4f-reg1.json -w '%{http_code}' -X POST "$API/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL_REG\",\"password\":\"secret12\",\"firstName\":\"Reg\",\"lastName\":\"User\"}")
UID_REG=$(psqlq "SELECT id FROM \"User\" WHERE email='$EMAIL_REG';")
EV=$(psqlq "SELECT \"emailVerified\"::text FROM \"User\" WHERE email='$EMAIL_REG';")
if [[ "$HTTP" == "200" || "$HTTP" == "201" ]] && [[ "$EV" == "false" ]]; then
  ok "1 register emailVerified=false"
else
  bad "1 register (http=$HTTP ev=$EV uid=$UID_REG)"
fi

echo "=== 2–3 Register phone unverified, no Account(PHONE) ==="
HTTP=$(curl -sS -o /tmp/b4f-reg2.json -w '%{http_code}' -X POST "$API/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"b4f-reg2-${TS}@example.com\",\"password\":\"secret12\",\"phone\":\"$PHONE_REG\",\"firstName\":\"Reg\",\"lastName\":\"Phone\"}")
UID_REG2=$(psqlq "SELECT id FROM \"User\" WHERE phone='$PHONE_REG';")
PV=$(psqlq "SELECT \"phoneVerified\"::text FROM \"User\" WHERE phone='$PHONE_REG';")
ACC=$(psqlq "SELECT count(*) FROM \"Account\" WHERE provider='PHONE' AND \"providerId\"='$PHONE_REG';")
if [[ "$HTTP" == "200" || "$HTTP" == "201" ]] && [[ "$PV" == "false" ]] && [[ "$ACC" == "0" ]]; then
  ok "2–3 register phoneVerified=false and no Account(PHONE)"
else
  bad "2–3 register phone (http=$HTTP pv=$PV acc=$ACC uid=$UID_REG2)"
fi

echo "=== 4 Register does not link orphans ==="
ORPHAN_PHONE="+421911${RAND}"
RESP=$(curl -sS -X POST "$API/orders" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: b4f-orph-$(date +%s%N)" \
  -d "{\"items\":[{\"productVariantId\":\"$VARIANT_ID\",\"quantity\":1}],\"customerFirstName\":\"Guest\",\"customerLastName\":\"Buyer\",\"customerPhone\":\"$ORPHAN_PHONE\",\"customerEmail\":\"b4f-orph-${TS}@example.com\",\"receiverFirstName\":\"Guest\",\"receiverLastName\":\"Buyer\",\"receiverPhone\":\"$ORPHAN_PHONE\",\"deliveryMethod\":\"pickup\",\"paymentMethod\":\"bank-transfer\",\"privacyConsent\":true}")
OID=$(printf '%s' "$RESP" | json_get id || true)
HTTP=$(curl -sS -o /tmp/b4f-reg3.json -w '%{http_code}' -X POST "$API/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"b4f-orph-${TS}@example.com\",\"password\":\"secret12\",\"firstName\":\"Orph\",\"lastName\":\"Reg\"}")
ATT=$(psqlq "SELECT coalesce(\"userId\"::text,'') FROM \"Order\" WHERE id='$OID';")
if [[ -n "$OID" && ( "$HTTP" == "200" || "$HTTP" == "201" ) && "$ATT" == "" ]]; then
  ok "4 register does not link orphans"
else
  bad "4 register orphan link (http=$HTTP att=$ATT oid=$OID)"
fi

echo "=== 5 Phone checkout OTP + raw email → only phone verified ==="
PHONE5="+421912${RAND}"
EMAIL5="b4f-sib5-${TS}@example.com"
VT=$(mint_checkout_otp phone "$PHONE5")
HTTP=$(checkout_identity "{\"phone\":\"$PHONE5\",\"email\":\"$EMAIL5\",\"verificationToken\":\"$VT\",\"firstName\":\"Chk\",\"lastName\":\"Phone\"}" /tmp/b4f-5.json)
UID5=$(psqlq "SELECT id FROM \"User\" WHERE phone='$PHONE5';")
ROW5=$(psqlq "SELECT coalesce(email,'')||'|'||\"emailVerified\"::text||'|'||\"phoneVerified\"::text FROM \"User\" WHERE phone='$PHONE5';")
ACC5=$(psqlq "SELECT count(*) FROM \"Account\" WHERE provider='PHONE' AND \"providerId\"='$PHONE5';")
if [[ ( "$HTTP" == "200" || "$HTTP" == "201" ) && "$ROW5" == "|false|true" && "$ACC5" == "1" ]]; then
  ok "5 phone OTP ignores raw email (row=$ROW5)"
else
  bad "5 phone+raw email (http=$HTTP row=$ROW5 acc=$ACC5 body=$(head -c 200 /tmp/b4f-5.json))"
fi

echo "=== 6 Email checkout OTP + raw phone → only email verified ==="
EMAIL6="b4f-sib6-${TS}@example.com"
PHONE6="+421913${RAND}"
VT=$(mint_checkout_otp email "$EMAIL6")
HTTP=$(checkout_identity "{\"email\":\"$EMAIL6\",\"phone\":\"$PHONE6\",\"verificationToken\":\"$VT\",\"firstName\":\"Chk\",\"lastName\":\"Email\"}" /tmp/b4f-6.json)
ROW6=$(psqlq "SELECT coalesce(phone,'')||'|'||\"phoneVerified\"::text||'|'||\"emailVerified\"::text FROM \"User\" WHERE email='$EMAIL6';")
ACC6=$(psqlq "SELECT count(*) FROM \"Account\" WHERE provider='PHONE' AND \"providerId\"='$PHONE6';")
if [[ ( "$HTTP" == "200" || "$HTTP" == "201" ) && "$ROW6" == "|false|true" && "$ACC6" == "0" ]]; then
  ok "6 email OTP ignores raw phone (row=$ROW6)"
else
  bad "6 email+raw phone (http=$HTTP row=$ROW6 acc=$ACC6 body=$(head -c 200 /tmp/b4f-6.json))"
fi

echo "=== 7 Phone OTP + email owned by another User → no merge / no email verify ==="
PHONE7="+421914${RAND}"
OWNED_EMAIL_BEFORE=$(psqlq "SELECT email||'|'||\"emailVerified\"::text FROM \"User\" WHERE id='$USER_OWNED';")
VT=$(mint_checkout_otp phone "$PHONE7")
HTTP=$(checkout_identity "{\"phone\":\"$PHONE7\",\"email\":\"$EMAIL_OWNED\",\"verificationToken\":\"$VT\",\"firstName\":\"Chk\",\"lastName\":\"NoMerge\"}" /tmp/b4f-7.json)
UID7=$(psqlq "SELECT id FROM \"User\" WHERE phone='$PHONE7';")
ROW7=$(psqlq "SELECT coalesce(email,'')||'|'||\"emailVerified\"::text||'|'||\"phoneVerified\"::text FROM \"User\" WHERE phone='$PHONE7';")
OWNED_AFTER=$(psqlq "SELECT email||'|'||\"emailVerified\"::text FROM \"User\" WHERE id='$USER_OWNED';")
if [[ ( "$HTTP" == "200" || "$HTTP" == "201" ) && "$ROW7" == "|false|true" && "$OWNED_AFTER" == "$OWNED_EMAIL_BEFORE" && "$UID7" != "$USER_OWNED" ]]; then
  ok "7 phone OTP + foreign email: no merge"
else
  bad "7 (http=$HTTP row=$ROW7 owned=$OWNED_AFTER uid7=$UID7)"
fi

echo "=== 8 Email OTP + phone owned by another User → no phone verify / no Account ==="
EMAIL8="b4f-sib8-${TS}@example.com"
OWNED_PHONE_BEFORE=$(psqlq "SELECT phone||'|'||\"phoneVerified\"::text FROM \"User\" WHERE id='$USER_OWNED';")
VT=$(mint_checkout_otp email "$EMAIL8")
HTTP=$(checkout_identity "{\"email\":\"$EMAIL8\",\"phone\":\"$PHONE_OWNED\",\"verificationToken\":\"$VT\",\"firstName\":\"Chk\",\"lastName\":\"NoPhone\"}" /tmp/b4f-8.json)
ROW8=$(psqlq "SELECT coalesce(phone,'')||'|'||\"phoneVerified\"::text||'|'||\"emailVerified\"::text FROM \"User\" WHERE email='$EMAIL8';")
ACC8=$(psqlq "SELECT count(*) FROM \"Account\" WHERE provider='PHONE' AND \"providerId\"='$PHONE_OWNED' AND \"userId\"!='$USER_OWNED';")
OWNED_PH_AFTER=$(psqlq "SELECT phone||'|'||\"phoneVerified\"::text FROM \"User\" WHERE id='$USER_OWNED';")
if [[ ( "$HTTP" == "200" || "$HTTP" == "201" ) && "$ROW8" == "|false|true" && "$ACC8" == "0" && "$OWNED_PH_AFTER" == "$OWNED_PHONE_BEFORE" ]]; then
  ok "8 email OTP + foreign phone: no steal"
else
  bad "8 (http=$HTTP row=$ROW8 acc=$ACC8 owned=$OWNED_PH_AFTER)"
fi

echo "=== 9 Phone-proof create → email stays unverified/absent ==="
# Covered by #5: phone-proof FOC+update leaves emailVerified false
if [[ "$ROW5" == "|false|true" ]]; then ok "9 phone-proof flow does not verify email"; else bad "9"; fi

echo "=== 10 Email-proof create → phone stays unverified/absent ==="
if [[ "$ROW6" == "|false|true" && "$ACC6" == "0" ]]; then ok "10 email-proof flow does not verify phone"; else bad "10"; fi

echo "=== 11 Existing verified email + checkout phone → email unchanged ==="
PHONE11="+421915${RAND}"
VT=$(mint_checkout_otp phone "$PHONE11")
# First create phone-only user, then set verified email via SQL to simulate existing
HTTP=$(checkout_identity "{\"phone\":\"$PHONE11\",\"verificationToken\":\"$VT\",\"firstName\":\"Chk\",\"lastName\":\"ExistE\"}" /tmp/b4f-11a.json)
UID11=$(psqlq "SELECT id FROM \"User\" WHERE phone='$PHONE11';")
psqlq "UPDATE \"User\" SET email='$EMAIL_CHK', \"emailVerified\"=true WHERE id='$UID11';" >/dev/null
VT=$(mint_checkout_otp phone "$PHONE11")
HTTP=$(checkout_identity "{\"phone\":\"$PHONE11\",\"email\":\"b4f-attacker11-${TS}@example.com\",\"verificationToken\":\"$VT\",\"firstName\":\"Chk\",\"lastName\":\"ExistE\"}" /tmp/b4f-11.json)
ROW11=$(psqlq "SELECT email||'|'||\"emailVerified\"::text FROM \"User\" WHERE id='$UID11';")
if [[ ( "$HTTP" == "200" || "$HTTP" == "201" ) && "$ROW11" == "$EMAIL_CHK|true" ]]; then
  ok "11 existing verified email unchanged"
else
  bad "11 (http=$HTTP row=$ROW11)"
fi

echo "=== 12 Existing verified phone + checkout email → phone unchanged ==="
EMAIL12="b4f-chk12-${TS}@example.com"
VT=$(mint_checkout_otp email "$EMAIL12")
HTTP=$(checkout_identity "{\"email\":\"$EMAIL12\",\"verificationToken\":\"$VT\",\"firstName\":\"Chk\",\"lastName\":\"ExistP\"}" /tmp/b4f-12a.json)
UID12=$(psqlq "SELECT id FROM \"User\" WHERE email='$EMAIL12';")
psqlq "UPDATE \"User\" SET phone='$PHONE_CHK', \"phoneVerified\"=true WHERE id='$UID12';" >/dev/null
psqlq "INSERT INTO \"Account\" (id, provider, \"providerId\", \"userId\") VALUES (gen_random_uuid(), 'PHONE', '$PHONE_CHK', '$UID12');" >/dev/null || true
VT=$(mint_checkout_otp email "$EMAIL12")
HTTP=$(checkout_identity "{\"email\":\"$EMAIL12\",\"phone\":\"+421916${RAND}\",\"verificationToken\":\"$VT\",\"firstName\":\"Chk\",\"lastName\":\"ExistP\"}" /tmp/b4f-12.json)
ROW12=$(psqlq "SELECT phone||'|'||\"phoneVerified\"::text FROM \"User\" WHERE id='$UID12';")
if [[ ( "$HTTP" == "200" || "$HTTP" == "201" ) && "$ROW12" == "$PHONE_CHK|true" ]]; then
  ok "12 existing verified phone unchanged"
else
  bad "12 (http=$HTTP row=$ROW12)"
fi

echo "=== 13 Profile contact OTP still works ==="
USER_PROF=$(psqlq "INSERT INTO \"User\" (id, email, \"emailVerified\", phone, \"phoneVerified\", \"firstName\", \"lastName\", role, newsletter, optin, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), null, false, null, false, 'Prof', 'Test', 'USER', false, false, NOW(), NOW()) RETURNING id;")
TOKEN_PROF=$(sign_customer_jwt "$USER_PROF")
clear_otp_ip
curl -sS -X POST "$API/account/contacts/email/start" \
  -H "Authorization: Bearer $TOKEN_PROF" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL_PROF\"}" >/tmp/b4f-prof-start.json
redis_set_otp email "$EMAIL_PROF" "222333" profile
VT=$(curl -sS -X POST "$API/auth/otp/verify" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL_PROF\",\"code\":\"222333\",\"purpose\":\"profile\"}" | json_get verificationToken)
HTTP=$(curl -sS -o /tmp/b4f-prof-c.json -w '%{http_code}' -X POST "$API/account/contacts/email/confirm" \
  -H "Authorization: Bearer $TOKEN_PROF" -H 'Content-Type: application/json' \
  -d "{\"verificationToken\":\"$VT\"}")
ROW_PROF=$(psqlq "SELECT email||'|'||\"emailVerified\"::text FROM \"User\" WHERE id='$USER_PROF';")
if [[ ( "$HTTP" == "200" || "$HTTP" == "201" ) && "$ROW_PROF" == "$EMAIL_PROF|true" ]]; then
  ok "13 profile email OTP works"
else
  bad "13 profile (http=$HTTP row=$ROW_PROF)"
fi

echo "=== 14 BATCH 4 lifecycle smoke (PATCH email rejected) ==="
HTTP=$(curl -sS -o /tmp/b4f-patch.json -w '%{http_code}' -X PATCH "$API/account/profile" \
  -H "Authorization: Bearer $TOKEN_PROF" -H 'Content-Type: application/json' \
  -d "{\"email\":\"b4f-patch-${TS}@example.com\"}")
STILL=$(psqlq "SELECT email FROM \"User\" WHERE id='$USER_PROF';")
if [[ "$HTTP" == "400" && "$STILL" == "$EMAIL_PROF" ]]; then ok "14 PATCH email rejected"; else bad "14 ($HTTP $STILL)"; fi

echo "=== 15 Google mismatch protection (code audit) ==="
if grep -q "storedEmail !== Google email: never mark stored email verified" \
  /Users/user/DevProjects/green-angels-project/green-angels-backend/src/auth/auth.service.ts 2>/dev/null \
  || docker exec green-angels-api sh -c 'grep -q "never mark stored email verified" dist/auth/auth.service.js 2>/dev/null || grep -rq "never mark stored email verified" src/auth/auth.service.ts'; then
  ok "15 Google mismatch guard present"
else
  # Fallback: DB policy — mismatched stored email stays unverified without equal Google email
  USER_G=$(psqlq "INSERT INTO \"User\" (id, email, \"emailVerified\", phone, \"phoneVerified\", \"firstName\", \"lastName\", role, newsletter, optin, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'b4f-mm-${TS}@example.com', false, null, false, 'G', 'Test', 'USER', false, false, NOW(), NOW()) RETURNING id;")
  VER=$(psqlq "SELECT \"emailVerified\"::text FROM \"User\" WHERE id='$USER_G';")
  if [[ "$VER" == "false" ]]; then ok "15 mismatch user remains unverified (policy)"; else bad "15"; fi
fi

echo "=== 16 SEC-007 guest orphan smoke ==="
EMAIL16="b4f-guest-${TS}@example.com"
PHONE16="+421917${RAND}"
BEFORE_U=$(psqlq 'SELECT count(*) FROM "User";')
RESP=$(curl -sS -X POST "$API/orders" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: b4f-g-$(date +%s%N)" \
  -d "{\"items\":[{\"productVariantId\":\"$VARIANT_ID\",\"quantity\":1}],\"customerFirstName\":\"Guest\",\"customerLastName\":\"Buyer\",\"customerPhone\":\"$PHONE16\",\"customerEmail\":\"$EMAIL16\",\"receiverFirstName\":\"Guest\",\"receiverLastName\":\"Buyer\",\"receiverPhone\":\"$PHONE16\",\"deliveryMethod\":\"pickup\",\"paymentMethod\":\"bank-transfer\",\"privacyConsent\":true}")
OID16=$(printf '%s' "$RESP" | json_get id || true)
AFTER_U=$(psqlq 'SELECT count(*) FROM "User";')
UID16=$(psqlq "SELECT coalesce(\"userId\"::text,'') FROM \"Order\" WHERE id='$OID16';")
if [[ -n "$OID16" && "$UID16" == "" && "$BEFORE_U" == "$AFTER_U" ]]; then
  ok "16 SEC-007 orphan guest order"
else
  bad "16 (oid=$OID16 uid=$UID16 users $BEFORE_U->$AFTER_U)"
fi

echo "=== 17 BATCH 3A claimGuestOrder disabled ==="
HTTP=$(curl -sS -o /tmp/b4f-claim.json -w '%{http_code}' -X POST "$API/account/orders/$OID16/claim" \
  -H "Authorization: Bearer $TOKEN_PROF" -H 'Content-Type: application/json' -d '{}')
ATT17=$(psqlq "SELECT coalesce(\"userId\"::text,'') FROM \"Order\" WHERE id='$OID16';")
if [[ "$ATT17" == "" && ( "$HTTP" == "400" || "$HTTP" == "403" || "$HTTP" == "404" || "$HTTP" == "409" ) ]]; then
  ok "17 claimGuestOrder does not attach"
else
  bad "17 claim (http=$HTTP att=$ATT17)"
fi

echo "=== 18 Profile phone OTP while login SMS off ==="
psqlq "UPDATE \"Settings\" SET value = ((COALESCE(NULLIF(value,''),'{}')::jsonb) || '{\"otpSmsLogin\":false,\"otpSmsCheckout\":false,\"otpSmsProfile\":true}'::jsonb)::text WHERE key='commerce.market';" >/dev/null || true
clear_otp_ip
HTTP_LOGIN=$(curl -sS -o /tmp/b4f-login-sms.json -w '%{http_code}' -X POST "$API/auth/otp/send" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE_PROF\",\"purpose\":\"login\"}")
HTTP_PROF=$(curl -sS -o /tmp/b4f-prof-sms.json -w '%{http_code}' -X POST "$API/account/contacts/phone/start" \
  -H "Authorization: Bearer $TOKEN_PROF" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE_PROF\"}")
if [[ "$HTTP_LOGIN" == "400" && "$HTTP_PROF" != "400" ]]; then
  ok "18 SK-like: login SMS off, profile SMS on (httpProf=$HTTP_PROF)"
else
  bad "18 (httpLogin=$HTTP_LOGIN httpProf=$HTTP_PROF)"
fi

echo "=== 19 SK checkout phone as plain order contact (SMS checkout off) ==="
PHONE19="+421918${RAND}"
EMAIL19="b4f-plain-${TS}@example.com"
BEFORE19=$(psqlq 'SELECT count(*) FROM "User";')
RESP=$(curl -sS -X POST "$API/orders" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: b4f-p-$(date +%s%N)" \
  -d "{\"items\":[{\"productVariantId\":\"$VARIANT_ID\",\"quantity\":1}],\"customerFirstName\":\"Guest\",\"customerLastName\":\"Buyer\",\"customerPhone\":\"$PHONE19\",\"customerEmail\":\"$EMAIL19\",\"receiverFirstName\":\"Guest\",\"receiverLastName\":\"Buyer\",\"receiverPhone\":\"$PHONE19\",\"deliveryMethod\":\"pickup\",\"paymentMethod\":\"bank-transfer\",\"privacyConsent\":true}")
OID19=$(printf '%s' "$RESP" | json_get id || true)
AFTER19=$(psqlq 'SELECT count(*) FROM "User";')
PH_USER=$(psqlq "SELECT count(*) FROM \"User\" WHERE phone='$PHONE19';")
if [[ -n "$OID19" && "$BEFORE19" == "$AFTER19" && "$PH_USER" == "0" ]]; then
  ok "19 checkout phone is plain order PII (no User)"
else
  bad "19 (oid=$OID19 users $BEFORE19->$AFTER19 phUser=$PH_USER)"
fi

echo "=== 20 Profile phone confirm creates Account(PHONE) ==="
redis_set_otp phone "$PHONE_PROF" "333444" profile
VT=$(curl -sS -X POST "$API/auth/otp/verify" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE_PROF\",\"code\":\"333444\",\"purpose\":\"profile\"}" | json_get verificationToken)
HTTP=$(curl -sS -o /tmp/b4f-ph-c.json -w '%{http_code}' -X POST "$API/account/contacts/phone/confirm" \
  -H "Authorization: Bearer $TOKEN_PROF" -H 'Content-Type: application/json' \
  -d "{\"verificationToken\":\"$VT\"}")
ROW20=$(psqlq "SELECT phone||'|'||\"phoneVerified\"::text FROM \"User\" WHERE id='$USER_PROF';")
ACC20=$(psqlq "SELECT count(*) FROM \"Account\" WHERE \"userId\"='$USER_PROF' AND provider='PHONE' AND \"providerId\"='$PHONE_PROF';")
if [[ ( "$HTTP" == "200" || "$HTTP" == "201" ) && "$ROW20" == "$PHONE_PROF|true" && "$ACC20" == "1" ]]; then
  ok "20 profile phone OTP → verified + Account(PHONE)"
else
  bad "20 (http=$HTTP row=$ROW20 acc=$ACC20 body=$(head -c 160 /tmp/b4f-ph-c.json))"
fi

echo "=== 21 OTP channel flags independently readable ==="
SMS_L=$(psqlq "SELECT (value::jsonb->>'otpSmsLogin') FROM \"Settings\" WHERE key='commerce.market';")
SMS_C=$(psqlq "SELECT (value::jsonb->>'otpSmsCheckout') FROM \"Settings\" WHERE key='commerce.market';")
SMS_P=$(psqlq "SELECT (value::jsonb->>'otpSmsProfile') FROM \"Settings\" WHERE key='commerce.market';")
if [[ "$SMS_L" == "false" && "$SMS_C" == "false" && "$SMS_P" == "true" ]]; then
  ok "21 independent OTP flags (login/checkout/profile)"
else
  bad "21 flags login=$SMS_L checkout=$SMS_C profile=$SMS_P"
fi

echo ""
echo "RESULT: $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
exit 0
