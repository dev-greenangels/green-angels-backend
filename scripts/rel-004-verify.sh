#!/usr/bin/env bash
# REL-004 — Stripe webhook event.id dedupe (Mono untouched)
set -euo pipefail

PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

psqlq() {
  docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "$1" | head -n1 | tr -d '[:space:]'
}

if grep -q claimWebhookEvent "$ROOT/src/payments/stripe.payment-provider.ts" && \
   grep -q StripeWebhookEvent "$ROOT/prisma/schema.prisma"; then
  ok "claimWebhookEvent + StripeWebhookEvent model present"
else
  bad "Stripe event dedupe wiring missing"
fi

if grep -q 'stripeWebhookEvent.create' "$ROOT/src/payments/stripe.payment-provider.ts" && \
   grep -q "P2002" "$ROOT/src/payments/stripe.payment-provider.ts"; then
  ok "unique insert + P2002 duplicate short-circuit"
else
  bad "P2002 claim path missing"
fi

if grep -q StripeWebhookEvent "$ROOT/src/monopay/monopay.service.ts" 2>/dev/null; then
  bad "Mono must not use StripeWebhookEvent"
else
  ok "Mono webhook untouched by StripeWebhookEvent"
fi

if grep -q 'enqueueExportOrderAfterOnlineCardPaid' "$ROOT/src/payments/stripe.payment-provider.ts"; then
  ok "paid path still enqueues Flexi after claim"
else
  bad "Flexi enqueue after paid missing"
fi

TABLE=$(psqlq "SELECT COUNT(*)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'StripeWebhookEvent'")
if [[ "$TABLE" == "1" ]]; then
  ok "StripeWebhookEvent table exists"
else
  bad "StripeWebhookEvent table missing (run migrate) got=${TABLE}"
fi

EVT="evt_rel004_verify_$(date +%s)_$RANDOM"
psqlq "INSERT INTO \"StripeWebhookEvent\" (id, type) VALUES ('${EVT}', 'checkout.session.completed')" >/dev/null

set +e
docker exec green-angels-postgres psql -U green_angels -d green_angels -v ON_ERROR_STOP=1 \
  -c "INSERT INTO \"StripeWebhookEvent\" (id, type) VALUES ('${EVT}', 'checkout.session.completed')" \
  >/tmp/rel004-dup.out 2>&1
DUP_RC=$?
set -e
if [[ "$DUP_RC" -ne 0 ]]; then
  ok "DB unique on event.id rejects duplicate insert"
else
  bad "duplicate event.id insert should fail unique constraint"
fi

psqlq "DELETE FROM \"StripeWebhookEvent\" WHERE id='${EVT}'" >/dev/null || true

echo ""
echo "REL-004 results: PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -gt 0 ]] && exit 1
exit 0
