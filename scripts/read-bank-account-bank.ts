/**
 * READ-ONLY: verify bankAccountCodeBank / BANKOVNÍ ÚČET for banka.banka semantics.
 *   npx tsx scripts/read-bank-account-bank.ts
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

function rootOf(json: unknown): Record<string, unknown> {
  const o = json as { winstrom?: Record<string, unknown> } | null
  return (o?.winstrom ?? o ?? {}) as Record<string, unknown>
}

async function loadCfg(): Promise<FlexiCfg & { bankAccountCodeBank: string }> {
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
    bankAccountCodeBank: String(raw.bankAccountCodeBank ?? 'BANKOVNÍ ÚČET').trim(),
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

async function main() {
  const cfg = await loadCfg()
  const code = cfg.bankAccountCodeBank
  console.log('CONFIGURED_bankAccountCodeBank=', JSON.stringify(code))

  const filter = encodeURIComponent(`kod='${code.replace(/'/g, "''")}'`)
  const acct = await getJson(
    cfg,
    `/bankovni-ucet/(${filter}).json?detail=custom:id,kod,nazev,mena,radaPrijem,radaVydej,buc,iban,stitky,platiOd,platiDo`,
  )
  console.log('ACCT_STATUS', acct.status)
  const rows = asArray(rootOf(acct.json)['bankovni-ucet'])
  if (!rows.length) {
    // list all bank accounts for diagnosis
    const list = await getJson(
      cfg,
      `/bankovni-ucet.json?limit=50&detail=custom:id,kod,nazev,mena,radaPrijem,radaVydej`,
    )
    console.log('LIST_STATUS', list.status)
    for (const r of asArray(rootOf(list.json)['bankovni-ucet'])) {
      console.log(
        'ACCT',
        JSON.stringify({
          id: r.id,
          kod: r.kod,
          nazev: r.nazev,
          mena: r.mena,
          radaPrijem: r.radaPrijem,
          radaVydej: r.radaVydej,
        }),
      )
    }
    return
  }
  console.log('ACCT', JSON.stringify(rows[0], null, 2))

  const bankaFilter = encodeURIComponent(`banka='code:${code.replace(/'/g, "''")}'`)
  const banka = await getJson(
    cfg,
    `/banka/(${bankaFilter}).json?limit=3&order=datVyst@D&detail=custom:id,kod,typDokl,banka,bankovniUcet,typPohybuK,konSym,varSym,datVyst,sumOsv,rada,sparovano`,
  )
  console.log('BANKA_LIST_STATUS', banka.status)
  for (const r of asArray(rootOf(banka.json).banka)) {
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
      'rada',
      'sparovano',
    ]) {
      console.log(`${k}=${JSON.stringify(r[k] ?? null)}`)
    }
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
