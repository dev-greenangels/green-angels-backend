/**
 * REL-003-PRE-A follow-up — sklad without rezervovat, nespec status, GET-by-ext forms.
 */
import { randomUUID } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { decryptSecret, resolveFlexiSecretsKey } from '../src/flexi/flexi.crypto'

const prisma = new PrismaClient()
const TIMEOUT_MS = 45_000

async function main() {
  const row = await prisma.settings.findUnique({ where: { key: 'integration.flexi' } })
  if (!row?.value) throw new Error('no flexi settings')
  const raw = JSON.parse(row.value) as Record<string, unknown>
  const key = resolveFlexiSecretsKey()
  if (!key) throw new Error('no decrypt key')
  const cfg = {
    baseUrl: String(raw.baseUrl).replace(/\/$/, ''),
    companyId: String(raw.companyId),
    username: String(raw.username),
    password: decryptSecret(String(raw.password), key),
    stock: String(raw.defaultStockCode || 'WHMAIN').trim(),
    typ: String(raw.orderDocTypeCode || 'OBP').trim() || 'OBP',
  }
  const auth = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')
  const base = `${cfg.baseUrl}/c/${encodeURIComponent(cfg.companyId)}`

  async function req(method: string, path: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = await res.text()
    let json: Record<string, unknown> | null = null
    try {
      json = JSON.parse(text) as Record<string, unknown>
    } catch {
      json = null
    }
    return { status: res.status, json, text: text.slice(0, 1500) }
  }

  const win = (j: unknown) =>
    ((j as { winstrom?: Record<string, unknown> } | null)?.winstrom ??
      (j as Record<string, unknown>) ??
      {}) as Record<string, unknown>
  const ok = (j: unknown) => {
    const w = win(j)
    return w.success === true || w.success === 'true'
  }
  const nid = (j: unknown): string | null => {
    const w = win(j)
    const results = w.results
    const first = Array.isArray(results) ? results[0] : results
    const id = (first as { id?: unknown } | undefined)?.id
    return id != null ? String(id) : null
  }
  const err = (j: unknown) => JSON.stringify(win(j)).slice(0, 500)

  const cenik = await req('GET', '/cenik.json?limit=5&detail=custom:kod,sumDostupMj&order=sumDostupMj@D')
  const cenikRows = (win(cenik.json).cenik as Array<{ kod?: string }>) ?? []
  const sku = cenikRows[0]?.kod
  if (!sku) throw new Error('no sku')
  console.log(`SKU=${sku} stock=${cfg.stock} typ=${cfg.typ}`)

  const tag = randomUUID().slice(0, 8)
  const ext = `ext:GA-SPIKE-F-${tag}`

  const put1 = await req('PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [
        {
          id: ext,
          typDokl: `code:${cfg.typ}`,
          datVyst: new Date().toISOString().slice(0, 10),
          popis: `PRE-A no-rezervovat ${tag}`,
          stavUzivK: 'stavDoklObch.schvaleno',
          polozkyObchDokladu: [
            {
              cenik: `code:${sku}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `no-rez ${tag}`,
              sklad: `code:${cfg.stock}`,
            },
          ],
        },
      ],
    },
  })
  console.log(
    'PUT sklad/no-rezervovat:',
    put1.status,
    ok(put1.json) ? `OK id=${nid(put1.json)}` : err(put1.json),
  )

  const getPaths = [
    `/objednavka-prijata/${encodeURIComponent(ext)}.json?detail=custom:id,kod,stavUzivK,storno`,
    `/objednavka-prijata/(${encodeURIComponent(`id='${ext}'`)}).json?detail=custom:id,kod,stavUzivK,storno`,
    `/objednavka-prijata.json?limit=5&detail=custom:id,kod,stavUzivK&filter=${encodeURIComponent(`id='${ext}'`)}`,
  ]
  for (const path of getPaths) {
    const g = await req('GET', path)
    const rows = win(g.json)['objednavka-prijata']
    const arr = Array.isArray(rows) ? rows : rows ? [rows] : []
    console.log(`GET ${path.slice(0, 90)} → HTTP ${g.status} rows=${arr.length}`)
    if (arr[0]) console.log('  ', arr[0])
  }

  const ext2 = `ext:GA-SPIKE-N-${tag}`
  const put2 = await req('PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [
        {
          id: ext2,
          typDokl: `code:${cfg.typ}`,
          datVyst: new Date().toISOString().slice(0, 10),
          popis: `PRE-A nespec ${tag}`,
          stavUzivK: 'stavDoklObch.nespec',
          polozkyObchDokladu: [
            {
              cenik: `code:${sku}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `nespec ${tag}`,
              sklad: `code:${cfg.stock}`,
            },
          ],
        },
      ],
    },
  })
  const id2 = nid(put2.json)
  console.log(
    'PUT nespec+sklad/no-rez:',
    put2.status,
    ok(put2.json) ? `OK id=${id2}` : err(put2.json),
  )
  if (id2) {
    const g2 = await req(
      'GET',
      `/objednavka-prijata/${id2}.json?detail=custom:id,kod,stavUzivK,storno`,
    )
    const rows = win(g2.json)['objednavka-prijata']
    const arr = Array.isArray(rows) ? rows : rows ? [rows] : []
    console.log('GET native', g2.status, arr[0])
  }

  const putBad = await req('PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [
        {
          id: `ext:GA-SPIKE-BAD-${tag}`,
          typDokl: `code:${cfg.typ}`,
          datVyst: new Date().toISOString().slice(0, 10),
          stavUzivK: 'stavDoklObch.unconfirmed_invented',
          polozkyObchDokladu: [
            { cenik: `code:${sku}`, mnozMj: 1, cenaMj: 1, sklad: `code:${cfg.stock}` },
          ],
        },
      ],
    },
  })
  console.log(
    'PUT invented status (expect fail):',
    putBad.status,
    ok(putBad.json) ? 'UNEXPECTED OK' : err(putBad.json),
  )

  // cleanup via path filter on ext ids
  const byExt = await req(
    'GET',
    `/objednavka-prijata/(${encodeURIComponent(`id='${ext}' or id='${ext2}'`)}).json?detail=custom:id,kod`,
  )
  const found = win(byExt.json)['objednavka-prijata']
  const foundArr = Array.isArray(found) ? found : found ? [found] : []
  console.log('path-filter cleanup candidates', foundArr)
  for (const r of foundArr as Array<{ id?: unknown }>) {
    if (r.id == null) continue
    const d = await req('PUT', '/objednavka-prijata.json', {
      winstrom: {
        '@version': '1.0',
        'objednavka-prijata': [{ '@action': 'delete', id: String(r.id) }],
      },
    })
    console.log('cleanup', r.id, ok(d.json) ? 'OK' : err(d.json))
  }
  if (id2) {
    const d = await req('PUT', '/objednavka-prijata.json', {
      winstrom: {
        '@version': '1.0',
        'objednavka-prijata': [{ '@action': 'delete', id: id2 }],
      },
    })
    console.log('cleanup id2', id2, ok(d.json) ? 'OK' : err(d.json))
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(2)
  })
  .finally(() => prisma.$disconnect())
