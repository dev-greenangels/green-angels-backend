/**
 * REL-003-PRE-A follow-up: one order, two lines —
 * line A: rezervovat true (normal)
 * line B: rezervovat false (late-conflict / On stock reservation = false)
 * Document is LEFT in Flexi for manual inspection (no delete).
 *
 *   npx tsx scripts/rel-003-pre-a-rezervovat-false-demo.ts
 */
import { randomUUID } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { decryptSecret, resolveFlexiSecretsKey } from '../src/flexi/flexi.crypto'

const prisma = new PrismaClient()
const TIMEOUT_MS = 45_000

async function main() {
  const row = await prisma.settings.findUnique({ where: { key: 'integration.flexi' } })
  if (!row?.value) throw new Error('no integration.flexi')
  const raw = JSON.parse(row.value) as Record<string, unknown>
  if (raw.enabled !== true && raw.enabled !== 'true') {
    throw new Error('Flexi disabled — enable in Backstage first')
  }
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
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { status: res.status, json, text: text.slice(0, 3000) }
  }

  const win = (j: unknown) =>
    ((j as { winstrom?: Record<string, unknown> } | null)?.winstrom ??
      (j as Record<string, unknown>) ??
      {}) as Record<string, unknown>

  const cenik = await req(
    'GET',
    '/cenik.json?limit=10&detail=custom:kod,nazev,sumDostupMj&order=sumDostupMj@D',
  )
  const items = (win(cenik.json).cenik as Array<{ kod?: string; nazev?: string; sumDostupMj?: number }>) ?? []
  const withStock = items.filter((i) => i.kod && Number(i.sumDostupMj ?? 0) >= 1)
  if (withStock.length < 2) {
    throw new Error(`need ≥2 cenik with stock, got ${withStock.length}`)
  }
  const skuA = withStock[0]!
  const skuB = withStock[1]!

  const tag = randomUUID().slice(0, 8)
  const ext = `ext:GA-SPIKE-LC-${tag}`

  console.log('=== Late-conflict demo order (KEEP in Flexi) ===')
  console.log(`stock=${cfg.stock} typ=${cfg.typ}`)
  console.log(`Line A (RESERVE):   ${skuA.kod} dostup=${skuA.sumDostupMj}`)
  console.log(`Line B (NO RESERVE): ${skuB.kod} dostup=${skuB.sumDostupMj}`)

  const put = await req('PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [
        {
          id: ext,
          typDokl: `code:${cfg.typ}`,
          datVyst: new Date().toISOString().slice(0, 10),
          popis: `REL-003 late-conflict demo ${tag}: lineA reserved, lineB On stock reservation=false`,
          stavUzivK: 'stavDoklObch.nespec',
          polozkyObchDokladu: [
            {
              cenik: `code:${skuA.kod}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `[RESERVE] ${skuA.nazev ?? skuA.kod}`,
              sklad: `code:${cfg.stock}`,
              rezervovat: true,
              rezervovatMj: 1,
            },
            {
              cenik: `code:${skuB.kod}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `[NO-RESERVE / late-conflict] ${skuB.nazev ?? skuB.kod}`,
              sklad: `code:${cfg.stock}`,
              rezervovat: false,
              rezervovatMj: 0,
            },
          ],
        },
      ],
    },
  })

  const root = win(put.json)
  const success = root.success === true || root.success === 'true'
  const results = Array.isArray(root.results) ? root.results : root.results ? [root.results] : []
  const first = results[0] as { id?: string; errors?: unknown } | undefined
  const nativeId = first?.id != null ? String(first.id) : null

  if (!success || put.status >= 400) {
    console.log('FAILED PUT', put.status, JSON.stringify(root).slice(0, 1200))
    process.exit(2)
  }

  console.log(`PUT OK nativeId=${nativeId} ext=${ext}`)

  // Read back lines with reservation flags
  const detail =
    'custom:id,kod,stavUzivK,storno,popis,polozkyObchDokladu(id,nazev,cenik,sklad,mnozMj,rezervovat,rezervovatMj)'
  const get = await req(
    'GET',
    `/objednavka-prijata/(${encodeURIComponent(`id='${ext}'`)}).json?detail=${encodeURIComponent(detail)}`,
  )
  const docs = win(get.json)['objednavka-prijata']
  const doc = (Array.isArray(docs) ? docs[0] : docs) as Record<string, unknown> | undefined
  if (!doc) {
    console.log('WARN: GET-by-ext path-filter returned empty; try native id', nativeId)
  } else {
    console.log('--- Document in Flexi ---')
    console.log(`kod=${doc.kod} id=${doc.id} stavUzivK=${doc.stavUzivK} storno=${doc.storno}`)
    console.log(`popis=${doc.popis}`)
    const lines = doc.polozkyObchDokladu
    const arr = Array.isArray(lines) ? lines : lines ? [lines] : []
    for (const line of arr as Array<Record<string, unknown>>) {
      console.log(
        `  line id=${line.id} rezervovat=${line.rezervovat} rezervovatMj=${line.rezervovatMj} nazev=${line.nazev}`,
      )
    }
  }

  console.log('')
  console.log('KEEP — open in Flexi UI and check On stock reservation per line:')
  console.log(`  kod: ${doc?.kod ?? '(see native id)'}`)
  console.log(`  native id: ${nativeId}`)
  console.log(`  ext: ${ext}`)
  console.log('Delete manually later if needed.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(2)
  })
  .finally(() => prisma.$disconnect())
