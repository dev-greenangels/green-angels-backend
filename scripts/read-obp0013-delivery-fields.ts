/**
 * READ-ONLY: inspect delivery fields on existing ABRA Received Order OBP0013/2026.
 * Does NOT modify any Flexi or local order data.
 *
 * Usage (from green-angels-backend):
 *   npx tsx scripts/read-obp0013-delivery-fields.ts
 */
import { PrismaClient } from '@prisma/client'
import { decryptSecret, resolveFlexiSecretsKey } from '../src/flexi/flexi.crypto'

const prisma = new PrismaClient()
const TIMEOUT_MS = 45_000

const FIELDS = [
  'id',
  'kod',
  'formaDopravy',
  'doprava',
  'branchId',
  'mistUrc',
  'faNazev',
  'faUlice',
  'faMesto',
  'faPsc',
  'faStat',
] as const

type FlexiCfg = {
  baseUrl: string
  companyId: string
  username: string
  password: string
}

function asArray(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[]
  if (v && typeof v === 'object') return [v as Record<string, unknown>]
  return []
}

async function loadCfg(): Promise<FlexiCfg> {
  const row = await prisma.settings.findUnique({ where: { key: 'integration.flexi' } })
  if (!row?.value) throw new Error('no integration.flexi settings')
  const raw = JSON.parse(row.value) as Record<string, unknown>
  const key = resolveFlexiSecretsKey()
  if (!key) throw new Error('cannot decrypt Flexi password')
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
    return { status: res.status, json, text: text.slice(0, 2000), url }
  } finally {
    clearTimeout(t)
  }
}

function printRow(row: Record<string, unknown>) {
  for (const f of FIELDS) {
    console.log(`${f}=${JSON.stringify(row[f] ?? null)}`)
  }
}

async function main() {
  const cfg = await loadCfg()
  const detail = `detail=custom:${FIELDS.join(',')}`

  const local = await prisma.order.findFirst({
    where: { orderNumber: 36 },
    select: {
      id: true,
      externalErpId: true,
      erpNativeId: true,
      erpNativeKod: true,
      deliveryMethod: true,
      deliveryBranch: true,
      deliveryBranchLabel: true,
    },
  })
  console.log('LOCAL_ORDER', JSON.stringify(local))

  const attempts: string[] = []
  if (local?.erpNativeId?.trim()) {
    attempts.push(`/objednavka-prijata/${encodeURIComponent(local.erpNativeId.trim())}.json?${detail}`)
  }
  if (local?.externalErpId?.trim()) {
    const ext = local.externalErpId.trim()
    const filter = encodeURIComponent(`id='${ext.replace(/'/g, "''")}'`)
    attempts.push(`/objednavka-prijata/(${filter}).json?${detail}`)
  }
  attempts.push(`/objednavka-prijata/${encodeURIComponent('code:OBP0013/2026')}.json?${detail}`)

  for (const path of attempts) {
    const res = await getJson(cfg, path)
    console.log('TRY', res.status, path)
    if (res.status >= 400) {
      console.log('ERR', res.text.slice(0, 300))
      continue
    }
    const root = ((res.json as { winstrom?: Record<string, unknown> })?.winstrom ??
      res.json) as Record<string, unknown>
    const rows = asArray(root['objednavka-prijata'])
    if (!rows.length) {
      console.log('NO_ROWS', JSON.stringify(root).slice(0, 500))
      continue
    }
    printRow(rows[0]!)
    return
  }
  console.log('FAILED_ALL_LOOKUPS')
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
