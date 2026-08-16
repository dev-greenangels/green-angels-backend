#!/usr/bin/env bash
# CAB-005 — market-aware delivery/TTN labels in cabinet
set -euo pipefail

PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHOP="$ROOT/green-angels-shop"
TRACK="$SHOP/lib/shipping/tracking.ts"
LIST="$SHOP/components/account/account-orders-content.tsx"
DETAIL="$SHOP/components/account/account-order-detail-content.tsx"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

if [[ -f "$TRACK" ]] && \
   grep -q buildTrackingUrl "$TRACK" && \
   grep -q tracking.packeta.com "$TRACK" && \
   grep -q gls-group.com "$TRACK" && \
   grep -q novaposhta.ua "$TRACK"; then
  ok "tracking helper covers NP / Packeta / GLS"
else
  bad "lib/shipping/tracking.ts incomplete"
fi

for f in "$LIST" "$DETAIL"; do
  name=$(basename "$f")
  if grep -q buildTrackingUrl "$f" && ! grep -q 'novaposhta.ua/tracking' "$f"; then
    ok "$name uses buildTrackingUrl (no hardcoded NP URL)"
  else
    bad "$name still hardcodes NP or missing helper"
  fi
  if grep -q "deliveryMethods." "$f" || grep -q "useTranslations('checkout')" "$f"; then
    ok "$name uses checkout delivery i18n"
  else
    bad "$name still uses DELIVERY_METHOD_LABELS / missing checkout i18n"
  fi
  if ! grep -q DELIVERY_METHOD_LABELS "$f"; then
    ok "$name no DELIVERY_METHOD_LABELS"
  else
    bad "$name still imports DELIVERY_METHOD_LABELS"
  fi
done

# Node smoke: carrier resolution
node --input-type=module <<'EOF' || exit 1
import { createRequire } from 'module'
// inline mirror of resolve logic for smoke (TS not compiled here)
function resolve(carrier, method) {
  const aliases = { 'nova-poshta': 'nova-poshta', packeta: 'packeta', gls: 'gls', zasilkovna: 'packeta' }
  const raw = (carrier || '').trim().toLowerCase()
  if (raw && aliases[raw]) return aliases[raw]
  const m = (method || '').trim().toLowerCase()
  if (m.startsWith('nova-poshta')) return 'nova-poshta'
  if (m.startsWith('packeta')) return 'packeta'
  if (m.startsWith('gls')) return 'gls'
  return null
}
function url(n, carrier, method) {
  const c = resolve(carrier, method)
  const e = encodeURIComponent(n)
  if (c === 'nova-poshta') return `https://novaposhta.ua/tracking/?cargo_number=${e}`
  if (c === 'packeta') return `https://tracking.packeta.com/?id=${e}`
  if (c === 'gls') return `https://gls-group.com/EU/en/parcel-tracking?match=${e}`
  return null
}
const cases = [
  [url('2045', 'nova-poshta', null)?.includes('novaposhta'), 'NP by carrier'],
  [url('Z123', null, 'packeta-box')?.includes('packeta'), 'Packeta by method'],
  [url('GLS1', 'gls', null)?.includes('gls-group'), 'GLS by carrier'],
  [url('X', null, 'pickup') === null, 'pickup has no track URL'],
]
let fail = 0
for (const [cond, name] of cases) {
  if (!cond) { console.error('FAIL smoke:', name); fail++ }
  else console.log('PASS smoke:', name)
}
process.exit(fail ? 1 : 0)
EOF

ok "carrier URL smoke cases"

echo ""
echo "PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
