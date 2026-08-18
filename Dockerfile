# Production image — do not use for local watch/dev (see Dockerfile.dev).
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++ openssl libc6-compat

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

# One-shot job: Prisma CLI (devDependency, lockfile-aligned) + migrations.
# Not the API runtime — no Nest process.
FROM node:22-alpine AS migrate

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/prisma ./prisma

USER node

CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]

FROM node:22-alpine AS runtime

RUN apk add --no-cache openssl libc6-compat curl python3 make g++

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

COPY package.json package-lock.json ./
COPY --from=builder /app/prisma ./prisma
# Skip repo postinstall (`prisma generate`) — CLI is a devDependency.
# Rebuild native addons after --ignore-scripts.
RUN npm ci --omit=dev --ignore-scripts \
    && npm rebuild bcrypt sharp \
    && apk del python3 make g++

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

RUN mkdir -p /data/uploads \
    && chown -R node:node /app /data/uploads

USER node

EXPOSE 3001

CMD ["node", "dist/main.js"]
