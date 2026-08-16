/**
 * ERP-WEBHOOK-002B/C — live Flexi API spike (read-mostly).
 * Does NOT invent endpoints. Prints VERIFIED / FAILED / SKIPPED.
 *
 * Usage: cd green-angels-backend && npx tsx scripts/erp-webhook-002b-flexi-spike.ts
 */
import { PrismaClient } from '@prisma/client'
import { decryptSecret, resolveFlexiSecretsKey } from '../src/flexi/flexi.crypto'

const prisma = new PrismaClient()
const TIMEOUT_MS = 25_000

type FlexiCfg = {
  baseUrl: string
  companyId: string
  username: string
  password: string
}

function auth(cfg: FlexiCfg) {
  return 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')
}

async function flexiGet(cfg: FlexiCfg, path: string): Promise<{ status: number; json: unknown; text: string }> {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/c/${encodeURIComponent(cfg.companyId)}${path}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
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
    return { status: res.status, json, text: text.slice(0, 2000) }
  } finally {
    clearTimeout(t)
  }
}

function asArray(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v as Record<string, unknown>[]
  if (v && typeof v === 'object') return [v as Record<string, unknown>]
  return []
}

function winstrom(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {}
  const p = payload as Record<string, unknown>
  return (p.winstrom ?? p) as Record<string, unknown>
}

async function main() {
  const row = await prisma.settings.findUnique({ where: { key: 'integration.flexi' } })
  if (!row?.value) {
    console.log('STOP: no integration.flexi settings')
    process.exit(2)
  }
  const raw = JSON.parse(row.value) as Record<string, unknown>
  const key = resolveFlexiSecretsKey()
  if (!key) {
    console.log('STOP: cannot decrypt Flexi password (FLEXI_SECRETS_KEY / JWT_SECRET)')
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
    console.log('STOP: Flexi credentials incomplete')
    process.exit(2)
  }

  console.log('=== ERP-WEBHOOK-002B/C Flexi live spike ===')
  console.log(`host=${cfg.baseUrl} company=${cfg.companyId} user=${cfg.username}`)

  // 0 connectivity + sample cenik ids
  const page = await flexiGet(cfg, '/cenik.json?limit=5&detail=custom:id,kod,nazev,sumDostupMj,cenaZakl')
  if (page.status >= 400) {
    console.log(`STOP: cenik list failed HTTP ${page.status}: ${page.text}`)
    process.exit(2)
  }
  const cenikRows = asArray(winstrom(page.json).cenik)
  console.log(`VERIFIED: connectivity OK; sample cenik rows=${cenikRows.length}`)
  const ids = cenikRows.map((r) => String(r.id ?? '')).filter(Boolean)
  const kods = cenikRows.map((r) => String(r.kod ?? '')).filter(Boolean)
  console.log(`sample ids=${ids.join(',')} kods=${kods.join(',')}`)

  if (ids.length < 2) {
    console.log('SKIPPED: need ≥2 cenik ids for multi-id batch tests')
  } else {
    const idA = ids[0]!
    const idB = ids[1]!

    // 1 multi-id filter forms (documented Flexi filter style used elsewhere for kod)
    const candidates: Array<{ name: string; path: string }> = [
      {
        name: "path-filter id='A' or id='B'",
        path: `/cenik/(${encodeURIComponent(`id='${idA}' or id='${idB}'`)}).json?limit=0&detail=custom:id,kod,nazev,sumDostupMj,cenaZakl`,
      },
      {
        name: "query filter id='A' or id='B'",
        path: `/cenik.json?limit=0&detail=custom:id,kod,nazev,sumDostupMj,cenaZakl&filter=${encodeURIComponent(`id='${idA}' or id='${idB}'`)}`,
      },
      {
        name: 'ids comma path /cenik/id1,id2.json',
        path: `/cenik/${encodeURIComponent(`${idA},${idB}`)}.json?detail=custom:id,kod,nazev,sumDostupMj,cenaZakl`,
      },
      {
        name: "path-filter id in (A,B)",
        path: `/cenik/(${encodeURIComponent(`id in (${idA},${idB})`)}).json?limit=0&detail=custom:id,kod,nazev,sumDostupMj,cenaZakl`,
      },
    ]

    let batchOk: { name: string; count: number; path: string } | null = null
    for (const c of candidates) {
      const res = await flexiGet(cfg, c.path)
      const rows = asArray(winstrom(res.json).cenik)
      const gotIds = new Set(rows.map((r) => String(r.id)))
      const complete =
        res.status < 400 &&
        gotIds.has(idA) &&
        gotIds.has(idB) &&
        rows.every((r) => r.kod != null)
      console.log(
        `${complete ? 'VERIFIED' : 'FAILED'}: batch form "${c.name}" HTTP=${res.status} rows=${rows.length} hasA=${gotIds.has(idA)} hasB=${gotIds.has(idB)}`,
      )
      if (!complete && res.status >= 400) {
        console.log(`  body: ${res.text.slice(0, 300)}`)
      }
      if (complete && !batchOk) batchOk = { name: c.name, count: rows.length, path: c.path }
    }

    if (batchOk) {
      console.log(`VERIFIED: multi-ID cenik batch works via: ${batchOk.name} (rows=${batchOk.count})`)
      // practical size probe: up to 40 ids if available
      const more = await flexiGet(cfg, '/cenik.json?limit=40&detail=custom:id')
      const moreIds = asArray(winstrom(more.json).cenik)
        .map((r) => String(r.id ?? ''))
        .filter(Boolean)
      if (moreIds.length >= 5) {
        const filter = moreIds.map((id) => `id='${id}'`).join(' or ')
        const big = await flexiGet(
          cfg,
          `/cenik/(${encodeURIComponent(filter)}).json?limit=0&detail=custom:id,kod,sumDostupMj,cenaZakl`,
        )
        const bigRows = asArray(winstrom(big.json).cenik)
        console.log(
          `${big.status < 400 && bigRows.length >= Math.min(5, moreIds.length) ? 'VERIFIED' : 'FAILED'}: batch size probe n=${moreIds.length} returned=${bigRows.length} HTTP=${big.status}`,
        )
      }
    } else {
      console.log('UNVERIFIED: no working multi-ID cenik batch form among candidates')
    }

    // single id completeness (stock+price fields)
    const one = await flexiGet(
      cfg,
      `/cenik/${encodeURIComponent(idA)}.json?detail=custom:id,kod,nazev,sumDostupMj,cenaZakl,cenaZaklVcDph,prodejCena`,
    )
    const oneRow = asArray(winstrom(one.json).cenik)[0]
    console.log(
      `${one.status < 400 && oneRow ? 'VERIFIED' : 'FAILED'}: single cenik-by-id returns current record fields (kod=${oneRow?.kod} stock=${oneRow?.sumDostupMj} price=${oneRow?.cenaZakl ?? oneRow?.cenaZaklVcDph})`,
    )
  }

  // Changes API start= semantics + @in-version presence
  const ch0 = await flexiGet(cfg, '/changes.json?start=0&limit=5')
  const w0 = winstrom(ch0.json)
  const changes0 = asArray(w0.change ?? w0.changes)
  console.log(
    `${ch0.status < 400 ? 'VERIFIED' : 'FAILED'}: Changes API reachable HTTP=${ch0.status} rows=${changes0.length} next=${String(w0.next)}`,
  )
  if (changes0[0]) {
    const sample = changes0[0]
    const keys = Object.keys(sample)
    console.log(`change row keys: ${keys.join(',')}`)
    const hasIn =
      sample['@in-version'] != null || sample.inVersion != null || sample['in-version'] != null
    console.log(
      `${hasIn ? 'VERIFIED' : 'UNVERIFIED'}: @in-version present on sample change row = ${hasIn} (value=${sample['@in-version'] ?? sample.inVersion ?? sample['in-version'] ?? 'n/a'})`,
    )
    const evidences = [...new Set(changes0.map((c) => String(c.evidence ?? c['@evidence'] ?? '')))]
    console.log(`sample evidences in first page: ${evidences.join(' | ') || '(none)'}`)
  }

  // Inclusive start: take a version from a row and refetch with start=that version
  if (changes0.length >= 2) {
    const v = Number(
      changes0[1]!['@in-version'] ??
        changes0[1]!.inVersion ??
        changes0[1]!.globalVersion ??
        changes0[1]!['@globalVersion'] ??
        0,
    )
    if (v > 0) {
      const chV = await flexiGet(cfg, `/changes.json?start=${v}&limit=5`)
      const rowsV = asArray(winstrom(chV.json).change ?? winstrom(chV.json).changes)
      const versions = rowsV.map((c) =>
        Number(c['@in-version'] ?? c.inVersion ?? c.globalVersion ?? c['@globalVersion'] ?? 0),
      )
      const includesV = versions.some((x) => x === v)
      const allGe = versions.every((x) => x >= v)
      console.log(
        `${chV.status < 400 ? 'VERIFIED' : 'FAILED'}: start=${v} returned versions=[${versions.join(',')}] includesStart=${includesV} all>=start=${allGe}`,
      )
      if (includesV) console.log('VERIFIED: Changes start= appears INCLUSIVE for this company')
      else if (allGe && versions[0] && versions[0] > v)
        console.log('VERIFIED: Changes start= appears EXCLUSIVE (first row > start) for this company')
      else console.log('UNVERIFIED: could not determine inclusive/exclusive from sample')
    }
  } else {
    console.log('SKIPPED: not enough change rows to test start= inclusivity')
  }

  // Hooks list (official docs)
  const hooks = await flexiGet(cfg, '/hooks.json')
  console.log(
    `${hooks.status < 400 ? 'VERIFIED' : 'FAILED'}: GET /hooks.json HTTP=${hooks.status}`,
  )
  if (hooks.status < 400) {
    const hw = winstrom(hooks.json)
    const list = asArray(hw.hooks ?? hw.hook)
    console.log(`VERIFIED: hooks list count=${list.length}`)
    if (list[0]) {
      console.log(`hook sample keys: ${Object.keys(list[0]).join(',')}`)
      console.log(
        `hook sample id=${list[0].id ?? list[0]['@id']} url=${list[0].url ?? list[0]['@url'] ?? '(n/a)'}`,
      )
    }
  } else {
    console.log(`hooks body: ${hooks.text.slice(0, 400)}`)
  }

  // skladova-karta evidence in recent changes (best-effort)
  const chStock = await flexiGet(cfg, '/changes.json?start=0&limit=100')
  const stockChanges = asArray(winstrom(chStock.json).change ?? winstrom(chStock.json).changes)
  const evCounts = new Map<string, number>()
  for (const c of stockChanges) {
    const ev = String(c.evidence ?? c['@evidence'] ?? '').toLowerCase()
    evCounts.set(ev, (evCounts.get(ev) ?? 0) + 1)
  }
  console.log(
    `INFO: evidences in last≤100 changes: ${[...evCounts.entries()].map(([k, v]) => `${k}:${v}`).join(', ') || '(none)'}`,
  )
  const hasSklad = [...evCounts.keys()].some((k) => k.includes('sklad'))
  const hasCenik = [...evCounts.keys()].some((k) => k.includes('cenik') && !k.includes('strom-cenik'))
  console.log(
    `${hasSklad ? 'OBSERVED' : 'UNVERIFIED'}: skladova-karta (or sklad*) evidence in sample=${hasSklad}; cenik in sample=${hasCenik}`,
  )
  console.log(
    'NOTE: whether stock-only moves always also emit cenik cannot be proven without a controlled stock write — leave UNVERIFIED unless OBSERVED together.',
  )

  console.log('=== spike done ===')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

// follow-up appended below was moved — see run via second invocation flag
