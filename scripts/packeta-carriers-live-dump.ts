/**
 * One-shot READ-ONLY live carriers dump for ops report.
 * Never prints apiKey / apiPassword.
 * Usage: npx tsx scripts/packeta-carriers-live-dump.ts
 */
import 'dotenv/config'

import { PrismaClient } from '@prisma/client'

import {
  groupPacketaCarriersByCountry,
  parsePacketaCarriersFeed,
  type PacketaCarrier,
} from '../src/packeta/packeta-carriers'

const PRIORITY = ['SK', 'CZ', 'HU', 'AT', 'DE'] as const

async function main() {
  const prisma = new PrismaClient()
  try {
    const row = await prisma.settings.findUnique({ where: { key: 'integration.packeta' } })
    if (!row?.value) {
      console.log('RESULT: no integration.packeta settings row')
      return
    }
    let parsed: { enabled?: boolean; apiKey?: string; senderLabel?: string }
    try {
      parsed = JSON.parse(row.value) as typeof parsed
    } catch {
      console.log('RESULT: invalid settings JSON')
      return
    }
    const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : ''
    const enabled = parsed.enabled === true
    const sender = typeof parsed.senderLabel === 'string' ? parsed.senderLabel.trim() : ''
    if (!enabled || !apiKey || !sender) {
      console.log(
        `RESULT: not configured (enabled=${enabled}, apiKeyConfigured=${Boolean(apiKey)}, senderConfigured=${Boolean(sender)})`,
      )
      return
    }

    const url = `https://pickup-point.api.packeta.com/v5/${encodeURIComponent(apiKey)}/carrier/json?lang=en`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      console.log(`RESULT: upstream HTTP ${res.status}`)
      return
    }
    const json: unknown = await res.json()
    const carriers = parsePacketaCarriersFeed(json)
    const byCountry = groupPacketaCarriersByCountry(carriers)

    const summarize = (list: PacketaCarrier[]) =>
      list.map((c) => ({
        id: c.id,
        name: c.name,
        available: c.available,
        apiAllowed: c.apiAllowed,
        pickupPoints: c.pickupPoints,
        maxWeightKg: c.maxWeightKg,
        codAllowed: c.codAllowed,
        requiresSize: c.requiresSize,
        bdsStatus: c.bdsStatus,
        currency: c.currency,
      }))

    console.log(`RESULT: ok count=${carriers.length}`)
    for (const cc of PRIORITY) {
      console.log(`\n=== ${cc} (${byCountry[cc]?.length ?? 0}) ===`)
      console.log(JSON.stringify(summarize(byCountry[cc] ?? []), null, 2))
    }
    const others = Object.keys(byCountry)
      .filter((c) => !(PRIORITY as readonly string[]).includes(c))
      .sort()
    console.log(`\n=== OTHER countries: ${others.join(', ') || '(none)'} ===`)
    for (const cc of others) {
      console.log(`\n--- ${cc} (${byCountry[cc]?.length ?? 0}) ---`)
      console.log(JSON.stringify(summarize(byCountry[cc] ?? []), null, 2))
    }

    const confirmed = carriers.filter((c) => c.bdsStatus === 'confirmed')
    const possible = carriers.filter((c) => c.bdsStatus === 'possible')
    const direct = carriers.filter((c) => c.bdsStatus === 'no' && c.pickupPoints === false)
    console.log('\n=== BDS confirmed ===')
    console.log(JSON.stringify(summarize(confirmed), null, 2))
    console.log('\n=== BDS possible ===')
    console.log(JSON.stringify(summarize(possible), null, 2))
    console.log('\n=== Direct (bdsStatus=no, not PUDO) sample count ===')
    console.log(direct.length)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('RESULT: script error', err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
