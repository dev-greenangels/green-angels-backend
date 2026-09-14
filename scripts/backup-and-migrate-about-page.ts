/**
 * Backup + migrate/bootstrap of Settings key `page.about`.
 *
 * Usage (from green-angels-backend):
 *   npx tsx scripts/backup-and-migrate-about-page.ts
 *   npx tsx scripts/backup-and-migrate-about-page.ts --write
 *
 * Default: backup + preview only (no DB write).
 * --write:
 *   - SK/EU: version-aware approved EU About v2 bootstrap (idempotent; never
 *     overwrites manager-edited content once euApprovedContentVersion is set)
 *   - UA: normalize/migrate to schema v2 only (preserves UA copy; no EU pack)
 *
 * Production SK Coolify also runs the same bootstrap via SettingsService.onModuleInit
 * (prisma migrate deploy alone does NOT migrate Settings JSON).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { PrismaClient } from '@prisma/client'

import { SETTINGS_KEYS } from '../src/settings/settings.constants'
import {
  normalizeAboutPageSettings,
  parseStoredAboutPageSettings,
} from '../src/settings/about-page.normalize'
import {
  decideEuAboutBootstrap,
  rawAboutLooksLikeV1,
} from '../src/settings/about-eu-bootstrap'
import { normalizeMarketSettings } from '../src/settings/market.types'

const prisma = new PrismaClient()

async function main() {
  const write = process.argv.includes('--write')
  const row = await prisma.settings.findUnique({
    where: { key: SETTINGS_KEYS.ABOUT_PAGE },
  })
  const marketRow = await prisma.settings.findUnique({
    where: { key: SETTINGS_KEYS.COMMERCE_MARKET },
  })

  let marketRaw: unknown = {}
  if (marketRow?.value) {
    try {
      marketRaw = JSON.parse(marketRow.value)
    } catch {
      marketRaw = {}
    }
  }
  const market = normalizeMarketSettings(marketRaw)

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = resolve(__dirname, `../backups/about-page`)
  mkdirSync(dir, { recursive: true })
  const backupPath = resolve(dir, `page.about.${stamp}.json`)

  const rawValue = row?.value ?? null
  let parsed: unknown = null
  if (rawValue) {
    try {
      parsed = JSON.parse(rawValue)
    } catch {
      parsed = rawValue
    }
  }

  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        backedUpAt: new Date().toISOString(),
        key: SETTINGS_KEYS.ABOUT_PAGE,
        marketRegion: market.region,
        raw: parsed,
      },
      null,
      2,
    ),
    'utf8',
  )
  console.log(`Backup written: ${backupPath}`)

  let toPersist = normalizeAboutPageSettings(parsed ?? {}, market.region)
  let action = 'normalize-v2'

  if (market.region === 'sk') {
    const stored = parseStoredAboutPageSettings(parsed ?? {}, 'sk')
    const decision = decideEuAboutBootstrap('sk', stored, {
      rawWasV1: rawAboutLooksLikeV1(parsed),
    })
    action = decision.action
    if (decision.action === 'seed-full' || decision.action === 'fill-missing') {
      toPersist = decision.next
    } else {
      toPersist = stored.euApprovedContentVersion
        ? stored
        : normalizeAboutPageSettings(parsed ?? {}, 'sk')
    }
  }

  const previewPath = resolve(dir, `page.about.${stamp}.preview.json`)
  writeFileSync(
    previewPath,
    JSON.stringify({ action, marketRegion: market.region, next: toPersist }, null, 2),
    'utf8',
  )
  console.log(`Preview (${action}): ${previewPath}`)

  if (!write) {
    console.log('Dry-run only. Re-run with --write to persist.')
    return
  }

  if (market.region === 'sk' && (action === 'noop' || action === 'skip-ua')) {
    console.log(`No DB write needed (${action}).`)
    return
  }

  await prisma.settings.upsert({
    where: { key: SETTINGS_KEYS.ABOUT_PAGE },
    create: {
      key: SETTINGS_KEYS.ABOUT_PAGE,
      value: JSON.stringify(toPersist),
    },
    update: {
      value: JSON.stringify(toPersist),
    },
  })
  console.log(`Persisted page.about (${action}).`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
