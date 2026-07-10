#!/bin/sh
set -e

echo "Installing dependencies..."
npm install

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Generating Prisma client..."
npx prisma generate

exec "$@"
