/**
 * FLEXI-BULK-QUERY-SPIKE — read-only live comparison:
 * POST /cenik/query.json vs GET path-filter (current production pattern).
 *
 * Usage: cd green-angels-backend && npx tsx scripts/flexi-bulk-query-spike.ts
 */
import { PrismaClient } from '@prisma/client'

import { decryptSecret, resolveFlexiSecretsKey } from '../src/flexi/flexi.crypto'

const prisma = new PrismaClient()
const TIMEOUT_MS = 45_000

const CENIK_DETAIL =
  'custom:id,kod,nazev,cenaZakl,cenaZaklVcDph,prodejCena,cenaZaklBezDph,sumDostupMj,sumStavMj,stavMJ,skladem,hmotMj,hmotObal,nomen'

const REQUIRED_FIELDS = [
  'id',
  'kod',
  'nazev',
  'cenaZakl',
  'cenaZaklVcDph',
  'prodejCena',
  'cenaZaklBezDph',
  'hmotMj',
  'nomen',
] as const

type FlexiCfg = {
  baseUrl: string
  companyId: string
  username: string
  password: string
}

function auth(cfg: FlexiCfg) {
  return 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')
}

function base(cfg: FlexiCfg) {
  return `${cfg.baseUrl.replace(/\/$/, '')}/c/${encodeURIComponent(cfg.companyId)}`
}

function winstrom(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {}
  const p = payload as Record<string, unknown>
  return (p.winstrom ?? p) as Record<string, unknown>
}

function asCenikRows(payload: unknown): Record<string, unknown>[] {
  const w = winstrom(payload)
  const raw = w.cenik ?? w['cenik']
  if (Array.isArray(raw)) return raw as Record<string, unknown>[]
  if (raw && typeof raw === 'object') return [raw as Record<string, unknown>]
  return []
}

function escapeLiteral(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function buildKodOrFilter(skus: string[]): string {
  return skus.map((k) => `kod='${escapeLiteral(k)}'`).join(' or ')
}

function missingFields(row: Record<string, unknown>): string[] {
  const miss: string[] = []
  for (const f of REQUIRED_FIELDS) {
    const v = row[f]
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim() && f !== 'nomen')) {
      if (f === 'nomen') continue
      miss.push(f)
    }
  }
  return miss
}

async function flexiGet(cfg: FlexiCfg, path: string) {
  const t0 = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${base(cfg)}${path}`, {
      method: 'GET',
      headers: { Authorization: auth(cfg), Accept: 'application/json' },
      signal: ctrl.signal,
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return {
      method: 'GET' as const,
      status: res.status,
      ms: Math.round(performance.now() - t0),
      json,
      bodyBytes: Buffer.byteLength(text, 'utf8'),
      error: res.ok ? null : text.slice(0, 400),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function flexiPostQuery(cfg: FlexiCfg, filter: string, limit: number) {
  const t0 = performance.now()
  const body = {
    winstrom: {
      detail: CENIK_DETAIL,
      filter: `(${filter})`,
      limit: String(limit),
      'no-ext-ids': 'true',
      '@version': '1.0',
    },
  }
  const bodyStr = JSON.stringify(body)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${base(cfg)}/cenik/query.json`, {
      method: 'POST',
      headers: {
        Authorization: auth(cfg),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: bodyStr,
      signal: ctrl.signal,
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return {
      method: 'POST /query' as const,
      status: res.status,
      ms: Math.round(performance.now() - t0),
      json,
      bodyBytes: Buffer.byteLength(text, 'utf8'),
      requestBodyBytes: Buffer.byteLength(bodyStr, 'utf8'),
      error: res.ok ? null : text.slice(0, 400),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function flexiGetPathFilter(cfg: FlexiCfg, filter: string) {
  const path = `/cenik/(${encodeURIComponent(filter)}).json?limit=0&detail=${encodeURIComponent(CENIK_DETAIL)}`
  return flexiGet(cfg, path)
}

type CaseResult = {
  n: number
  requestedSkus: string[]
  phantomSku: string
  post: ReturnType<Awaited<ReturnType<typeof flexiPostQuery>> extends infer T ? () => T : never>
  get: Awaited<ReturnType<typeof flexiGetPathFilter>>
  postRows: number
  getRows: number
  postKods: string[]
  getKods: string[]
  postMissingExisting: string[]
  getMissingExisting: string[]
  postHasPhantom: boolean
  getHasPhantom: boolean
  postFieldGaps: number
  getFieldGaps: number
}

async function runCase(cfg: FlexiCfg, skus: string[], phantom: string): Promise<CaseResult> {
  const requested = skus.slice(0, skus.length)
  const all = [...requested, phantom]
  const filter = buildKodOrFilter(all)
  const limit = Math.max(200, all.length + 10)

  const post = await flexiPostQuery(cfg, filter, limit)
  const get = await flexiGetPathFilter(cfg, filter)

  const postRows = post.status === 200 ? asCenikRows(post.json) : []
  const getRows = get.status === 200 ? asCenikRows(get.json) : []

  const postKods = postRows.map((r) => String(r.kod ?? '').trim()).filter(Boolean)
  const getKods = getRows.map((r) => String(r.kod ?? '').trim()).filter(Boolean)

  const postSet = new Set(postKods)
  const getSet = new Set(getKods)

  return {
    n: requested.length,
    requestedSkus: requested,
    phantomSku: phantom,
    post,
    get,
    postRows: postRows.length,
    getRows: getRows.length,
    postKods,
    getKods,
    postMissingExisting: requested.filter((k) => !postSet.has(k)),
    getMissingExisting: requested.filter((k) => !getSet.has(k)),
    postHasPhantom: postSet.has(phantom),
    getHasPhantom: getSet.has(phantom),
    postFieldGaps: postRows.reduce((n, r) => n + (missingFields(r).length > 0 ? 1 : 0), 0),
    getFieldGaps: getRows.reduce((n, r) => n + (missingFields(r).length > 0 ? 1 : 0), 0),
  }
}

async function loadSkus(cfg: FlexiCfg): Promise<string[]> {
  const fromDb = await prisma.productVariant.findMany({
    where: { sku: { not: '' } },
    select: { sku: true },
    orderBy: { sku: 'asc' },
    take: 220,
  })
  if (fromDb.length >= 200) return fromDb.map((r) => r.sku.trim()).filter(Boolean)

  const page = await flexiGet(cfg, `/cenik.json?start=0&limit=220&detail=custom:kod`)
  const rows = asCenikRows(page.json)
  return rows.map((r) => String(r.kod ?? '').trim()).filter(Boolean)
}

async function main() {
  const row = await prisma.settings.findUnique({ where: { key: 'integration.flexi' } })
  if (!row?.value) {
    console.error('STOP: no integration.flexi in Settings')
    process.exit(2)
  }
  const raw = JSON.parse(row.value) as Record<string, unknown>
  const key = resolveFlexiSecretsKey()
  if (!key) {
    console.error('STOP: FLEXI_SECRETS_KEY / JWT_SECRET missing')
    process.exit(2)
  }
  const password = decryptSecret(String(raw.password ?? ''), key)
  const cfg: FlexiCfg = {
    baseUrl: String(raw.baseUrl ?? '').replace(/\/$/, ''),
    companyId: String(raw.companyId ?? ''),
    username: String(raw.username ?? ''),
    password,
  }
  if (!cfg.baseUrl || !cfg.companyId || !cfg.username || !cfg.password) {
    console.error('STOP: incomplete Flexi credentials')
    process.exit(2)
  }

  const ping = await flexiGet(cfg, '/cenik.json?limit=1&detail=custom:kod')
  if (ping.status !== 200) {
    console.error('STOP: Flexi ping failed', ping.status, ping.error)
    process.exit(2)
  }

  const pool = await loadSkus(cfg)
  if (pool.length < 200) {
    console.error(`STOP: need ≥200 SKUs, got ${pool.length}`)
    process.exit(2)
  }

  const phantom = `__GA_SPIKE_MISSING_${Date.now()}__`
  const sizes = [10, 40, 100, 200]
  const results: CaseResult[] = []

  for (const n of sizes) {
    const skus = pool.slice(0, n)
    results.push(await runCase(cfg, skus, phantom))
  }

  const out = {
    spike: 'FLEXI-BULK-QUERY-SPIKE',
    at: new Date().toISOString(),
    companyId: cfg.companyId,
    baseUrl: cfg.baseUrl,
    cenikDetail: CENIK_DETAIL,
    phantomSku: phantom,
    cases: results.map((r) => ({
      n: r.n,
      post: {
        status: r.post.status,
        ms: r.post.ms,
        rows: r.postRows,
        requestBodyBytes: r.post.requestBodyBytes,
        responseBodyBytes: r.post.bodyBytes,
        missingExisting: r.postMissingExisting,
        hasPhantom: r.postHasPhantom,
        fieldGapRows: r.postFieldGaps,
        error: r.post.error,
      },
      getPathFilter: {
        status: r.get.status,
        ms: r.get.ms,
        rows: r.getRows,
        responseBodyBytes: r.get.bodyBytes,
        missingExisting: r.getMissingExisting,
        hasPhantom: r.getHasPhantom,
        fieldGapRows: r.getFieldGaps,
        error: r.get.error,
      },
      match: {
        sameRowCount: r.postRows === r.getRows,
        sameKodSet:
          r.postKods.slice().sort().join(',') === r.getKods.slice().sort().join(','),
      },
    })),
  }

  console.log(JSON.stringify(out, null, 2))
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
