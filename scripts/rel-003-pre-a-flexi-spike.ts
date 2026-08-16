/**
 * REL-003-PRE-A — live Flexi spike: cancel/storno + exception/unconfirmed mapping.
 * Creates disposable test orders (ext:GA-SPIKE-*), verifies official @action delete/storno,
 * enumerates stavUzivK values from company DB. Cleans up spike docs when possible.
 *
 * Usage (from green-angels-backend, with DB + decrypt key available):
 *   npx tsx scripts/rel-003-pre-a-flexi-spike.ts
 *
 * NO Nest checkout / REL-003 implementation in this script.
 */
import { randomUUID } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { decryptSecret, resolveFlexiSecretsKey } from '../src/flexi/flexi.crypto'

const prisma = new PrismaClient()
const TIMEOUT_MS = 45_000

type FlexiCfg = {
  baseUrl: string
  companyId: string
  username: string
  password: string
  orderUserStatus: string
  defaultStockCode: string
  typDoklObj: string
}

type HttpResult = { status: number; json: unknown; text: string }

function auth(cfg: FlexiCfg) {
  return 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')
}

function companyBase(cfg: FlexiCfg) {
  return `${cfg.baseUrl.replace(/\/$/, '')}/c/${encodeURIComponent(cfg.companyId)}`
}

async function flexi(
  cfg: FlexiCfg,
  method: string,
  path: string,
  body?: unknown,
): Promise<HttpResult> {
  const url = `${companyBase(cfg)}${path.startsWith('/') ? path : `/${path}`}`
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: auth(cfg),
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { status: res.status, json, text: text.slice(0, 4000) }
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

function line(label: string, detail: string) {
  console.log(`${label}: ${detail}`)
}

function summarizeErrors(payload: unknown): string {
  const root = winstrom(payload)
  const results = asArray(root.results ?? root.result)
  const msgs: string[] = []
  for (const row of results) {
    for (const err of asArray(row.errors ?? row.error)) {
      const m = String(err.message ?? err['@message'] ?? '').trim()
      if (m) msgs.push(m)
    }
    if (typeof row.message === 'string' && row.message.trim()) msgs.push(row.message.trim())
  }
  if (msgs.length) return msgs.join(' | ')
  return JSON.stringify(root).slice(0, 500)
}

function parseWriteId(payload: unknown): string | null {
  const root = winstrom(payload)
  const success = root.success === true || root.success === 'true'
  if (!success) return null
  const first = asArray(root.results ?? root.result)[0]
  if (first?.id != null && String(first.id).trim()) return String(first.id).trim()
  return null
}

async function loadCfg(): Promise<FlexiCfg> {
  const row = await prisma.settings.findUnique({ where: { key: 'integration.flexi' } })
  if (!row?.value) throw new Error('no integration.flexi settings')
  const raw = JSON.parse(row.value) as Record<string, unknown>
  const key = resolveFlexiSecretsKey()
  if (!key) throw new Error('cannot decrypt Flexi password (FLEXI_SECRETS_KEY / JWT_SECRET)')
  if (raw.enabled !== true && raw.enabled !== 'true') {
    throw new Error('integration.flexi.enabled is false — enable in Backstage first')
  }
  return {
    baseUrl: String(raw.baseUrl ?? '').replace(/\/$/, ''),
    companyId: String(raw.companyId ?? ''),
    username: String(raw.username ?? ''),
    password: decryptSecret(String(raw.password ?? ''), key),
    orderUserStatus:
      String(raw.orderUserStatus ?? 'stavDoklObch.schvaleno').trim() || 'stavDoklObch.schvaleno',
    defaultStockCode: String(raw.defaultStockCode ?? '').trim(),
    typDoklObj: String(raw.typDoklObj ?? raw.orderTypeCode ?? 'OBP').trim() || 'OBP',
  }
}

async function pickSku(cfg: FlexiCfg): Promise<{ kod: string; dostup: number } | null> {
  const res = await flexi(
    cfg,
    'GET',
    '/cenik.json?limit=20&detail=custom:id,kod,nazev,sumDostupMj&order=sumDostupMj@D',
  )
  if (res.status >= 400) {
    line('FAILED', `cenik list HTTP ${res.status}`)
    return null
  }
  const rows = asArray(winstrom(res.json).cenik)
  for (const r of rows) {
    const kod = String(r.kod ?? '').trim()
    const dostup = Number(r.sumDostupMj ?? 0)
    if (kod && dostup >= 1) return { kod, dostup }
  }
  const first = rows[0]
  if (first?.kod) return { kod: String(first.kod).trim(), dostup: Number(first.sumDostupMj ?? 0) }
  return null
}

async function putOrder(
  cfg: FlexiCfg,
  doc: Record<string, unknown>,
): Promise<{ ok: boolean; nativeId: string | null; detail: string; raw: unknown }> {
  const res = await flexi(cfg, 'PUT', '/objednavka-prijata.json', {
    winstrom: { '@version': '1.0', 'objednavka-prijata': [doc] },
  })
  if (res.status >= 400) {
    return { ok: false, nativeId: null, detail: `HTTP ${res.status}: ${summarizeErrors(res.json)}`, raw: res.json }
  }
  const nativeId = parseWriteId(res.json)
  const root = winstrom(res.json)
  const success = root.success === true || root.success === 'true'
  if (!success) {
    return { ok: false, nativeId: null, detail: summarizeErrors(res.json), raw: res.json }
  }
  return { ok: true, nativeId, detail: `nativeId=${nativeId ?? '?'}`, raw: res.json }
}

async function getByExt(cfg: FlexiCfg, extId: string) {
  const res = await flexi(
    cfg,
    'GET',
    `/objednavka-prijata/${encodeURIComponent(extId)}.json?detail=custom:id,kod,stavUzivK,storno,stornoPol,sumCelkem,datVyst`,
  )
  if (res.status >= 400) return { found: false as const, status: res.status, row: null, text: res.text }
  const rows = asArray(winstrom(res.json)['objednavka-prijata'])
  return { found: rows.length > 0, status: res.status, row: rows[0] ?? null, text: res.text }
}

async function actionOnOrder(
  cfg: FlexiCfg,
  action: 'storno' | 'delete',
  id: string,
): Promise<{ ok: boolean; detail: string; raw: unknown }> {
  // Official: PUT/POST import with @action (Performing Actions docs).
  const res = await flexi(cfg, 'PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [{ '@action': action, id }],
    },
  })
  if (res.status >= 400) {
    return { ok: false, detail: `HTTP ${res.status}: ${summarizeErrors(res.json)}`, raw: res.json }
  }
  const root = winstrom(res.json)
  const success = root.success === true || root.success === 'true'
  if (!success) return { ok: false, detail: summarizeErrors(res.json), raw: res.json }
  return { ok: true, detail: `action=${action} ok`, raw: res.json }
}

async function main() {
  const cfg = await loadCfg()
  console.log('=== REL-003-PRE-A Flexi live spike ===')
  console.log(`host=${cfg.baseUrl} company=${cfg.companyId} user=${cfg.username}`)
  console.log(`orderUserStatus(settings)=${cfg.orderUserStatus} stock=${cfg.defaultStockCode || '(none)'}`)

  // --- A: connectivity ---
  const ping = await flexi(cfg, 'GET', '/cenik.json?limit=1&detail=custom:id,kod')
  if (ping.status >= 400) {
    line('STOP', `connectivity failed HTTP ${ping.status}`)
    process.exit(2)
  }
  line('VERIFIED', 'connectivity OK')

  // --- B: properties / enums for stavUzivK (do not invent) ---
  const props = await flexi(cfg, 'GET', '/objednavka-prijata/properties.json')
  if (props.status < 400) {
    const root = winstrom(props.json)
    const propsArr = asArray(root.properties ?? root.property)
    const stav = propsArr.find((p) => String(p.propertyName ?? p.name ?? '') === 'stavUzivK')
    if (stav) {
      line(
        'VERIFIED',
        `stavUzivK property exists type=${stav.type ?? stav['@type'] ?? '?'} enumerable=${stav.isEnumerable ?? stav.enumerable ?? '?'}`,
      )
      console.log('  stavUzivK meta snippet:', JSON.stringify(stav).slice(0, 600))
    } else {
      line('NOTE', 'stavUzivK not found in properties list (may still exist on docs)')
    }
  } else {
    line('FAILED', `properties HTTP ${props.status}`)
  }

  // Relations: user statuses for obchodní doklady (common Flexi relation)
  const relationCandidates = [
    '/stav-uzivani.json?limit=50&detail=custom:id,kod,nazev',
    '/stav-dokl-obch.json?limit=50&detail=custom:id,kod,nazev',
    '/objednavka-prijata/relations.json',
  ]
  for (const path of relationCandidates) {
    const r = await flexi(cfg, 'GET', path)
    if (r.status >= 400) {
      line('NOTE', `${path} → HTTP ${r.status}`)
      continue
    }
    const root = winstrom(r.json)
    const keys = Object.keys(root).filter((k) => !k.startsWith('@'))
    line('VERIFIED', `${path} OK keys=${keys.join(',') || '(none)'}`)
    for (const k of keys) {
      const rows = asArray(root[k])
      if (rows.length && rows[0] && ('kod' in rows[0] || 'nazev' in rows[0])) {
        console.log(
          `  sample ${k}:`,
          rows
            .slice(0, 15)
            .map((x) => `${x.kod ?? x.id}=${x.nazev ?? ''}`)
            .join(' | '),
        )
      }
    }
  }

  // Distinct stavUzivK already used on recent orders
  const recent = await flexi(
    cfg,
    'GET',
    '/objednavka-prijata.json?limit=30&order=datVyst@D&detail=custom:id,kod,stavUzivK,storno',
  )
  if (recent.status < 400) {
    const rows = asArray(winstrom(recent.json)['objednavka-prijata'])
    const statuses = new Map<string, number>()
    for (const r of rows) {
      const s = String(r.stavUzivK ?? '').trim() || '(empty)'
      statuses.set(s, (statuses.get(s) ?? 0) + 1)
    }
    line(
      'VERIFIED',
      `recent orders stavUzivK distribution: ${[...statuses.entries()]
        .map(([k, n]) => `${k}×${n}`)
        .join(', ')}`,
    )
  } else {
    line('FAILED', `recent orders HTTP ${recent.status}`)
  }

  const sku = await pickSku(cfg)
  if (!sku) {
    line('STOP', 'no cenik SKU for create tests')
    process.exit(2)
  }
  line('VERIFIED', `test SKU=${sku.kod} sumDostupMj=${sku.dostup}`)

  const useStock = Boolean(cfg.defaultStockCode && !/^WH-MAIN$/i.test(cfg.defaultStockCode))
  const spikeTag = randomUUID().slice(0, 8)
  const createdIds: string[] = []

  // --- C: create reserved order ---
  const extReserved = `ext:GA-SPIKE-R-${spikeTag}`
  const lineReserved: Record<string, unknown> = {
    cenik: `code:${sku.kod}`,
    mnozMj: 1,
    cenaMj: 1,
    nazev: `REL-003-PRE-A reserved ${spikeTag}`,
    rezervovat: true,
    rezervovatMj: 1,
  }
  if (useStock) lineReserved.sklad = `code:${cfg.defaultStockCode}`

  const reservedDoc: Record<string, unknown> = {
    id: extReserved,
    typDokl: `code:${cfg.typDoklObj}`,
    datVyst: new Date().toISOString().slice(0, 10),
    popis: `REL-003-PRE-A spike reserved ${spikeTag}`,
    stavUzivK: cfg.orderUserStatus,
    'polozkyObchDokladu': [lineReserved],
  }

  const putR = await putOrder(cfg, reservedDoc)
  if (putR.ok) {
    line('VERIFIED', `PUT reserved order OK ${putR.detail} ext=${extReserved}`)
    if (putR.nativeId) createdIds.push(putR.nativeId)
  } else {
    line('FAILED', `PUT reserved order: ${putR.detail}`)
    // Soft-fallback retry without rezervace (CONNECTED already treats this as success)
    delete lineReserved.rezervovat
    delete lineReserved.rezervovatMj
    delete lineReserved.sklad
    const putR2 = await putOrder(cfg, reservedDoc)
    if (putR2.ok) {
      line('VERIFIED', `soft-fallback without rezervovat OK ${putR2.detail}`)
      if (putR2.nativeId) createdIds.push(putR2.nativeId)
    } else {
      line('FAILED', `soft-fallback also failed: ${putR2.detail}`)
    }
  }

  const getR = await getByExt(cfg, extReserved)
  if (getR.found && getR.row) {
    line(
      'VERIFIED',
      `GET reserved: id=${getR.row.id} kod=${getR.row.kod} stavUzivK=${getR.row.stavUzivK} storno=${getR.row.storno}`,
    )
  } else {
    line('NOTE', `GET reserved not found HTTP ${getR.status}`)
  }

  // --- D: create NO-reservation exception-style order ---
  const extEx = `ext:GA-SPIKE-X-${spikeTag}`
  const lineEx: Record<string, unknown> = {
    cenik: `code:${sku.kod}`,
    mnozMj: 1,
    cenaMj: 1,
    nazev: `REL-003-PRE-A exception ${spikeTag}`,
  }
  const exDoc: Record<string, unknown> = {
    id: extEx,
    typDokl: `code:${cfg.typDoklObj}`,
    datVyst: new Date().toISOString().slice(0, 10),
    popis: `REL-003-PRE-A spike NO-RESERVATION ${spikeTag}`,
    stavUzivK: cfg.orderUserStatus,
    polozkyObchDokladu: [lineEx],
  }
  const putX = await putOrder(cfg, exDoc)
  if (putX.ok) {
    line(
      'VERIFIED',
      `PUT no-reservation order OK ${putX.detail} — soft-fallback shape usable as late-conflict seed`,
    )
    if (putX.nativeId) createdIds.push(putX.nativeId)
  } else {
    line('FAILED', `PUT no-reservation: ${putX.detail}`)
  }

  // Try alternate status codes only if they already appear in company data (never invent)
  if (recent.status < 400) {
    const rows = asArray(winstrom(recent.json)['objednavka-prijata'])
    const seen = [
      ...new Set(rows.map((r) => String(r.stavUzivK ?? '').trim()).filter(Boolean)),
    ].filter((s) => s !== cfg.orderUserStatus)
    if (seen.length === 0) {
      line(
        'UNVERIFIED',
        'no alternate stavUzivK observed in recent orders — do NOT invent unconfirmed code; product must pick from Flexi UI enums',
      )
    } else {
      const alt = seen[0]!
      const extAlt = `ext:GA-SPIKE-A-${spikeTag}`
      const altDoc: Record<string, unknown> = {
        id: extAlt,
        typDokl: `code:${cfg.typDoklObj}`,
        datVyst: new Date().toISOString().slice(0, 10),
        popis: `REL-003-PRE-A alt status ${alt}`,
        stavUzivK: alt,
        polozkyObchDokladu: [
          { cenik: `code:${sku.kod}`, mnozMj: 1, cenaMj: 1, nazev: `alt-status ${spikeTag}` },
        ],
      }
      const putA = await putOrder(cfg, altDoc)
      if (putA.ok) {
        line('VERIFIED', `PUT with observed alternate stavUzivK=${alt} OK ${putA.detail}`)
        if (putA.nativeId) createdIds.push(putA.nativeId)
        await actionOnOrder(cfg, 'delete', putA.nativeId ?? extAlt)
      } else {
        line('FAILED', `PUT alternate stavUzivK=${alt}: ${putA.detail}`)
      }
    }
  }

  // --- E: storno then delete on reserved (or whatever we created) ---
  const targetId = createdIds[0] ?? (getR.row?.id != null ? String(getR.row.id) : null)
  if (targetId) {
    const storno = await actionOnOrder(cfg, 'storno', targetId)
    if (storno.ok) {
      line('VERIFIED', `official @action=storno works on objednavka-prijata id=${targetId}`)
      const after = await getByExt(cfg, extReserved)
      if (after.found && after.row) {
        line(
          'VERIFIED',
          `after storno: storno=${after.row.storno} stavUzivK=${after.row.stavUzivK} kod=${after.row.kod}`,
        )
      }
    } else {
      line('FAILED', `@action=storno: ${storno.detail}`)
    }

    const del = await actionOnOrder(cfg, 'delete', targetId)
    if (del.ok) {
      line('VERIFIED', `official @action=delete works on objednavka-prijata id=${targetId}`)
    } else {
      line('FAILED', `@action=delete: ${del.detail}`)
    }
  } else {
    line('SKIPPED', 'no native id for storno/delete tests')
  }

  // Cleanup remaining spike docs
  for (const id of createdIds.slice(1)) {
    const d = await actionOnOrder(cfg, 'delete', id)
    line(d.ok ? 'CLEANUP' : 'CLEANUP-FAIL', `delete ${id}: ${d.detail}`)
  }
  for (const ext of [`ext:GA-SPIKE-X-${spikeTag}`, `ext:GA-SPIKE-A-${spikeTag}`]) {
    const g = await getByExt(cfg, ext)
    if (g.found && g.row?.id != null) {
      const d = await actionOnOrder(cfg, 'delete', String(g.row.id))
      line(d.ok ? 'CLEANUP' : 'CLEANUP-FAIL', `delete ${ext}: ${d.detail}`)
    }
  }

  console.log('')
  console.log('=== Spike complete — see REL-003-PRE-A-SPIKE.md (to be written from VERIFIED lines) ===')
}

main()
  .catch((e) => {
    console.error('STOP:', e instanceof Error ? e.message : e)
    process.exit(2)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
