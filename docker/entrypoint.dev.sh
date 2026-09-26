#!/bin/sh
set -e

# Always start Nest; never leave $@ empty (empty exec returns and falls through).
run_app() {
  if [ "$#" -gt 0 ]; then
    exec "$@"
  fi
  exec npm run start:dev
}

# Prisma copies schema.prisma into the generated client. If they differ (or the
# client is missing), regenerate — even under DEV_QUICK_START — so Nest never
# typechecks / runs against a stale Client after a schema change.
ensure_prisma_client() {
  schema="prisma/schema.prisma"
  generated="node_modules/.prisma/client/schema.prisma"
  if [ ! -f "$schema" ]; then
    echo "FATAL: missing $schema"
    exit 1
  fi
  if [ ! -f "$generated" ] || ! cmp -s "$schema" "$generated"; then
    echo "Prisma Client out of date vs schema.prisma — running prisma generate..."
    npx prisma generate
  else
    echo "Prisma Client matches schema.prisma"
  fi
}

# Nest --watch keeps the last successful child when a later compile fails.
# Gate the *initial* boot: refuse to start if the current tree does not build.
gate_nest_compile() {
  echo "Initial Nest compile gate..."
  if ! npx nest build; then
    echo "FATAL: Nest build failed — not starting API (avoids serving a stale watch process)."
    exit 1
  fi
  echo "Initial Nest compile OK"
}

bootstrap_prisma() {
  echo "Applying database migrations..."
  npx prisma migrate deploy
  ensure_prisma_client
}

# DEV_QUICK_START=1 — skip npm install only. Migrations + Prisma Client alignment
# + initial Nest compile still run so schema/client/runtime cannot silently diverge.
if [ "${DEV_QUICK_START}" = "1" ]; then
  echo "Quick start: skipping npm install (Prisma + Nest compile still enforced)"
  bootstrap_prisma
  gate_nest_compile
  run_app "$@"
fi

echo "Installing dependencies..."
npm install

bootstrap_prisma
gate_nest_compile
run_app "$@"
