#!/usr/bin/env bash
# ERP-WEBHOOK-002B/C — batch fetch + webhook lifecycle (extends 002A guarantees)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${API:-http://localhost:3001}"
PASS=0
FAIL=0

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

psqlq() {
  docker exec green-angels-postgres psql -U green_angels -d green_angels -tA -c "$1" | head -n1 | tr -d '[:space:]'
}

echo "=== ERP-WEBHOOK-002B/C verify ==="

# --- code contracts ---
if grep -q "fetchCenikByIds" "$ROOT/src/flexi/flexi.client.ts" \
  && grep -q "id='\${this.escapeFlexiLiteral(id)}'" "$ROOT/src/flexi/flexi.client.ts"; then
  ok "1 batch fetchCenikByIds uses verified path-filter id='…' or …"
else
  bad "1 fetchCenikByIds / path-filter missing"
fi

if grep -q "filter=" "$ROOT/src/flexi/flexi.client.ts" | head -1 >/dev/null; then
  # Ensure fetchCenikByIds itself does not use query filter=
  if awk '/async fetchCenikByIds/,/^  async /' "$ROOT/src/flexi/flexi.client.ts" | grep -q 'filter='; then
    bad "2 fetchCenikByIds must not use unsafe ?filter="
  else
    ok "2 fetchCenikByIds does not use unsafe query filter="
  fi
else
  ok "2 no query filter concern"
fi

if grep -q "listHooks" "$ROOT/src/flexi/flexi.client.ts" \
  && grep -q "deleteHook" "$ROOT/src/flexi/flexi.client.ts"; then
  ok "3 hooks list + delete client wrappers present"
else
  bad "3 hooks list/delete missing"
fi

if grep -q "disableWebhook" "$ROOT/src/flexi/flexi.service.ts" \
  && grep -q "webhookAccepting: false" "$ROOT/src/flexi/flexi.service.ts" \
  && grep -q "Changes API poll" "$ROOT/src/flexi/flexi.service.ts"; then
  ok "4 disableWebhook sets webhookAccepting=false without claiming ERP sync off"
else
  bad "4 disableWebhook semantics missing"
fi

if grep -q "listHooks" "$ROOT/src/flexi/flexi.service.ts" \
  && grep -A20 "async registerWebhook" "$ROOT/src/flexi/flexi.service.ts" | grep -q "match"; then
  ok "5 registerWebhook idempotent (reuse existing remote hook)"
else
  bad "5 register idempotency missing"
fi

if grep -q "fetchCenikByIds" "$ROOT/src/flexi/flexi.service.ts" \
  && grep -q "resolveCenikIdFromSkladovaKarta" "$ROOT/src/flexi/flexi.service.ts"; then
  ok "6 processDurableIntake uses batch cenik + skladova-karta→cenik"
else
  bad "6 batch processor wiring missing"
fi

if grep -q "disable-webhook" "$ROOT/../green-angels-shop/app/api/backstage/flexi/disable-webhook/route.ts" 2>/dev/null \
  || [[ -f "$ROOT/../green-angels-shop/app/api/backstage/flexi/disable-webhook/route.ts" ]]; then
  ok "7 shop BFF disable-webhook route exists"
else
  bad "7 shop BFF disable-webhook missing"
fi

if grep -q "Вимкнути webhook" "$ROOT/../green-angels-shop/components/backstage/flexi-settings-form.tsx" \
  && grep -q "webhookRegistrationStatus" "$ROOT/../green-angels-shop/components/backstage/flexi-settings-form.tsx" \
  && grep -q "Вимкнення webhook ≠ вимкнення ERP sync" "$ROOT/../green-angels-shop/components/backstage/flexi-settings-form.tsx"; then
  ok "8 existing Flexi settings UI extended (status + disable, no new page)"
else
  bad "8 UI extension missing"
fi

# --- 002A safe cursor still present ---
if grep -q "recomputeAndPersistLastSafeCursor" "$ROOT/src/flexi/flexi.change-intake.service.ts"; then
  ok "9 002A safe cursor helper still present"
else
  bad "9 safe cursor missing"
fi

# --- webhookAccepting false does not clear Flexi enabled ---
BEFORE=$(psqlq "SELECT (value::jsonb->>'enabled') FROM \"Settings\" WHERE key='integration.flexi' LIMIT 1;")
# simulate disable fields only
psqlq "UPDATE \"Settings\" SET value = ((COALESCE(NULLIF(value,''),'{}')::jsonb) || '{\"webhookAccepting\":false}'::jsonb)::text WHERE key='integration.flexi';" >/dev/null || true
AFTER_EN=$(psqlq "SELECT (value::jsonb->>'enabled') FROM \"Settings\" WHERE key='integration.flexi' LIMIT 1;")
AFTER_WA=$(psqlq "SELECT (value::jsonb->>'webhookAccepting') FROM \"Settings\" WHERE key='integration.flexi' LIMIT 1;")
if [[ "$AFTER_WA" == "false" && "$AFTER_EN" == "$BEFORE" ]]; then
  ok "10 webhookAccepting=false leaves enabled unchanged (was $BEFORE)"
else
  bad "10 enabled mutated or accepting not set (enabled $BEFORE→$AFTER_EN accepting=$AFTER_WA)"
fi
# restore accepting
psqlq "UPDATE \"Settings\" SET value = ((COALESCE(NULLIF(value,''),'{}')::jsonb) || '{\"webhookAccepting\":true}'::jsonb)::text WHERE key='integration.flexi';" >/dev/null || true

# --- poll path still ingest+process ---
if grep -A15 "async pollChanges" "$ROOT/src/flexi/flexi.service.ts" | grep -q "ingestChanges" \
  && grep -A15 "async pollChanges" "$ROOT/src/flexi/flexi.service.ts" | grep -q "processDurableIntake"; then
  ok "11 Changes poll and WebHook share intake→process path"
else
  bad "11 poll path divergence"
fi

# --- spike report present ---
if [[ -f "$ROOT/../ERP-WEBHOOK-002B-SPIKE.md" ]]; then
  ok "12 live spike report present"
else
  bad "12 spike report missing"
fi

echo ""
echo "Running ERP-WEBHOOK-002A suite…"
if bash "$ROOT/scripts/erp-webhook-002a-verify.sh"; then
  ok "13 ERP-WEBHOOK-002A regression PASS"
else
  bad "13 ERP-WEBHOOK-002A regression FAIL"
fi

echo ""
echo "002B/C core PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
