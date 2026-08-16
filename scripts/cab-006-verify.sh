#!/usr/bin/env bash
# CAB-006 — favorites empty/error parity with account lists
set -euo pipefail

PASS=0
FAIL=0
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SHOP="$ROOT/green-angels-shop"
UI="$SHOP/components/favorites/favorites-page-content.tsx"

ok() { echo "PASS: $*"; PASS=$((PASS + 1)); }
bad() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }

if grep -q 'setError' "$UI" && grep -q "t('loadError')" "$UI" && grep -q 'text-destructive' "$UI"; then
  ok "favorites shows load error state"
else
  bad "favorites missing error state"
fi

if grep -q Loader2 "$UI"; then
  ok "favorites loading uses Loader2"
else
  bad "favorites loading spinner missing"
fi

if grep -q emptyTitle "$UI" && grep -q unavailable "$UI"; then
  ok "favorites keeps empty + unavailable states"
else
  bad "empty/unavailable incomplete"
fi

# Silent swallow of !res.ok → [] must be gone
if ! grep -q 'if (!res.ok) return \[\]' "$UI"; then
  ok "no silent !res.ok → empty array"
else
  bad "still swallows HTTP errors"
fi

for loc in uk en sk hu de cs; do
  if python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert 'loadError' in d.get('favorites',{})" \
    "$SHOP/messages/$loc.json" 2>/dev/null; then
    ok "messages/$loc.json favorites.loadError"
  else
    bad "messages/$loc.json missing favorites.loadError"
  fi
done

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
