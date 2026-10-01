/**
 * READ-ONLY: inspect one real STRIPE incoming banka + typDokl STANDARD series fields.
 * Does not create/modify anything.
 *
 *   npx tsx scripts/read-stripe-banka-konSym.ts
 */
import { PrismaClient } from '@prisma/client'
import { decryptSecret, resolveFlexiSecretsKey } from '../src/flexi/flexi.crypto'

const prisma = new PrismaClient()
const TIMEOUT_MS = 45_000

type FlexiCfg = { baseUrl: string; companyId: string; username: string; password: string }

function asArray(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[]
  if (v && typeof v === 'object') return [v as Record<string, unknown>]
  return []
}

async function loadCfg(): Promise<FlexiCfg> {
  const row = await prisma.settings.findUnique({ where: { key: 'integration.flexi' } })
  if (!row?.value) throw new Error('no integration.flexi')
  const raw = JSON.parse(row.value) as Record<string, unknown>
  const key = resolveFlexiSecretsKey()
  if (!key) throw new Error('no decrypt key')
  return {
    baseUrl: String(raw.baseUrl ?? '').replace(/\/$/, ''),
    companyId: String(raw.companyId ?? ''),
    username: String(raw.username ?? ''),
    password: decryptSecret(String(raw.password ?? ''), key),
  }
}

async function getJson(cfg: FlexiCfg, path: string) {
  const auth = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')
  const url = `${cfg.baseUrl}/c/${encodeURIComponent(cfg.companyId)}${path}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: auth, Accept: 'application/json' },
      signal: ctrl.signal,
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { status: res.status, json, text: text.slice(0, 2500) }
  } finally {
    clearTimeout(t)
  }
}

function rootOf(json: unknown): Record<string, unknown> {
  const o = json as { winstrom?: Record<string, unknown> } | null
  return (o?.winstrom ?? o ?? {}) as Record<string, unknown>
}

async function main() {
  const cfg = await loadCfg()

  // Recent banka on STRIPE account / STANDARD type
  const list = await getJson(
    cfg,
    `/banka.json?limit=5&order=datVyst@D&detail=custom:id,kod,typDokl,banka,bankovniUcet,typPohybuK,konSym,varSym,datVyst,sumOsv,sumCelkem,bezPolozek,rada,sparovano`,
  )
  console.log('LIST_STATUS', list.status)
  const rows = asArray(rootOf(list.json).banka)
  for (const r of rows) {
    console.log('---BANKA---')
    for (const k of [
      'id',
      'kod',
      'typDokl',
      'banka',
      'bankovniUcet',
      'typPohybuK',
      'konSym',
      'varSym',
      'datVyst',
      'sumOsv',
      'sumCelkem',
      'bezPolozek',
      'rada',
      'sparovano',
    ]) {
      console.log(`${k}=${JSON.stringify(r[k] ?? null)}`)
    }
  }

  const typ = await getJson(
    cfg,
    `/typ-banka/(kod='STANDARD').json?detail=custom:id,kod,nazev,radaPrijem,radaVydej,bspBan,bspBanPrijem,bspBanVydej`,
  )
  console.log('TYP_STATUS', typ.status)
  const typRows = asArray(rootOf(typ.json)['typ-banka'])
  console.log('TYP_STANDARD', JSON.stringify(typRows[0] ?? rootOf(typ.json), null, 2).slice(0, 2000))

  const acct = await getJson(
    cfg,
    `/bankovni-ucet/(kod='STRIPE').json?detail=custom:id,kod,nazev,radaPrijem,radaVydej,mena`,
  )
  console.log('ACCT_STATUS', acct.status)
  const acctRows = asArray(rootOf(acct.json)['bankovni-ucet'])
  console.log('ACCT_STRIPE', JSON.stringify(acctRows[0] ?? rootOf(acct.json), null, 2).slice(0, 2000))

  // kon-sym 0008
  const ks = await getJson(
    cfg,
    `/konst-symbol/(kod='0008').json?detail=custom:id,kod,nazev`,
  )
  console.log('KS_STATUS', ks.status)
  const ksRows = asArray(rootOf(ks.json)['konst-symbol'])
  console.log('KS_0008', JSON.stringify(ksRows[0] ?? rootOf(ks.json), null, 2).slice(0, 1000))

  // banka properties snippet for kod/konSym/rada
  const props = await getJson(cfg, `/banka/properties`)
  console.log('PROPS_STATUS', props.status)
  const text = props.text
  for (const needle of ['"kod"', '"konSym"', '"rada"', '"banka"', '"bankovniUcet"', 'isRequired']) {
    const idx = text.indexOf(needle)
    if (idx >= 0) console.log('PROP_HIT', needle, text.slice(Math.max(0, idx - 80), idx + 200).replace(/\s+/g, ' '))
  }
}

main()
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
  .then(async () => {
    await prisma.$disconnect()
  })
