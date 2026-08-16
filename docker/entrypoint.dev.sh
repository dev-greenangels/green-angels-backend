#!/bin/sh
set -e

# Always start Nest; never leave $@ empty (empty exec returns and falls through).
run_app() {
  if [ "$#" -gt 0 ]; then
    exec "$@"
  fi
  exec npm run start:dev
}

# DEV_QUICK_START=1 — швидкий рестарт без npm install / prisma generate
if [ "${DEV_QUICK_START}" = "1" ]; then
  echo "Quick start: skipping npm install and prisma generate"
  run_app "$@"
fi

echo "Installing dependencies..."
npm install

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Generating Prisma client..."
npx prisma generate

run_app "$@"
