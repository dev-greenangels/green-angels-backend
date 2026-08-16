/**
 * Clean late-conflict demo: normal e-shop-like lines (SKU, name, price, VAT, warehouse)
 * but NO reservation + status Nešpecifikované (stavDoklObch.nespec).
 * KEEP in Flexi for inspection.
 */
import { randomUUID } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { decryptSecret, resolveFlexiSecretsKey } from '../src/flexi/flexi.crypto'

const prisma = new PrismaClient()

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
      signal: AbortSignal.timeout(45_000),
    })
    return { status: res.status, json: await res.json() }
  }
  const win = (j: unknown) =>
    ((j as { winstrom?: Record<string, unknown> })?.winstrom ?? {}) as Record<string, unknown>

  // Copy header context from a real e-shop order
  const sample = await req(
    'GET',
    '/objednavka-prijata/65.json?detail=custom:firma,typDokl,mena,stredisko,popis',
  )
  const sampleDoc = (win(sample.json)['objednavka-prijata'] as unknown[])?.[0] as Record<
    string,
    unknown
  >
  if (!sampleDoc?.firma) throw new Error('sample order missing firma')

  // Two catalog products with real names/prices
  const cenik = await req(
    'GET',
    '/cenik.json?limit=30&detail=custom:kod,nazev,cenaZakl,cenaZaklVcDph,sumDostupMj&order=sumDostupMj@D',
  )
  const items = (
    (win(cenik.json).cenik as Array<{
      kod?: string
      nazev?: string
      cenaZakl?: number
      cenaZaklVcDph?: number
      sumDostupMj?: number
    }>) ?? []
  ).filter((i) => i.kod && Number(i.sumDostupMj ?? 0) >= 1)

  // Prefer CUPR (known free for reserve) + another with stock
  const cupr = items.find((i) => i.kod === 'CUPR-LEYL-C2')
  const other = items.find((i) => i.kod && i.kod !== cupr?.kod)
  const a = cupr ?? items[0]
  const b = other ?? items[1] ?? items[0]
  if (!a?.kod || !b?.kod) throw new Error('need 2 cenik items')

  const priceA = Number(a.cenaZaklVcDph ?? a.cenaZakl ?? 1) || 1
  const priceB = Number(b.cenaZaklVcDph ?? b.cenaZakl ?? 1) || 1
  const vatPercent = 20 // SK standard for demo (e-shop sends order.taxRatePercent)

  const tag = randomUUID().slice(0, 8)
  const fakeOrderNo = `ZY-SPIKE-${tag}`
  const ext = `ext:GA-SPIKE-LC-${tag}`

  const put = await req('PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [
        {
          id: ext,
          typDokl: sampleDoc.typDokl ?? 'code:OBP',
          firma: sampleDoc.firma,
          datVyst: new Date().toISOString().slice(0, 10),
          // Same style as site: "E-shop ZY-…"
          popis: `E-shop ${fakeOrderNo}`,
          // Late conflict → Nešpecifikované
          stavUzivK: 'stavDoklObch.nespec',
          mena: sampleDoc.mena,
          stredisko: sampleDoc.stredisko,
          polozkyObchDokladu: [
            {
              cenik: `code:${a.kod}`,
              nazev: a.nazev ?? a.kod,
              mnozMj: 1,
              cenaMj: priceA,
              sklad: `code:${cfg.stock}`,
              typCenyDphK: 'typCeny.sDph',
              szbDph: vatPercent,
              // conflict: do not reserve
              rezervovat: false,
              rezervovatMj: 0,
            },
            {
              cenik: `code:${b.kod}`,
              nazev: b.nazev ?? b.kod,
              mnozMj: 1,
              cenaMj: priceB,
              sklad: `code:${cfg.stock}`,
              typCenyDphK: 'typCeny.sDph',
              szbDph: vatPercent,
              rezervovat: false,
              rezervovatMj: 0,
            },
          ],
        },
      ],
    },
  })

  const root = win(put.json)
  const ok = root.success === true || root.success === 'true'
  const id = (root.results as Array<{ id?: string }>)?.[0]?.id
  if (!ok || !id) {
    console.log('PUT FAILED', put.status, JSON.stringify(root).slice(0, 1200))
    process.exit(2)
  }

  // Auto-reserve may flip flags — force clear reservation on all lines
  const g0 = await req(
    'GET',
    `/objednavka-prijata/${id}.json?detail=custom:kod,polozkyObchDokladu(id,nazev,rezervovat,rezervovatMj)`,
  )
  const doc0 = (win(g0.json)['objednavka-prijata'] as unknown[])?.[0] as Record<string, unknown>
  const lines0 = (doc0?.polozkyObchDokladu ?? []) as Array<Record<string, unknown>>
  const clear = (Array.isArray(lines0) ? lines0 : [lines0]).map((l) => ({
    id: String(l.id),
    rezervovat: false,
    rezervovatMj: 0,
  }))
  await req('PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [{ id: String(id), polozkyObchDokladu: clear }],
    },
  })

  const detail =
    'custom:id,kod,firma,popis,stavUzivK,polozkyObchDokladu(id,nazev,cenik,mnozMj,cenaMj,sklad,szbDph,typCenyDphK,rezervovat,rezervovatMj)'
  const g = await req('GET', `/objednavka-prijata/${id}.json?detail=${encodeURIComponent(detail)}`)
  const doc = (win(g.json)['objednavka-prijata'] as unknown[])?.[0] as Record<string, unknown>

  console.log('')
  console.log('======== CLEAN LATE-CONFLICT DEMO (KEEP) ========')
  console.log(`kod:        ${doc?.kod}`)
  console.log(`id:         ${doc?.id}`)
  console.log(`status:     ${doc?.stavUzivK}  (expect stavDoklObch.nespec = Nešpecifikované)`)
  console.log(`popis:      ${doc?.popis}`)
  console.log(`firma:      ${doc?.firma}`)
  console.log('lines:')
  for (const l of (doc?.polozkyObchDokladu as Array<Record<string, unknown>>) ?? []) {
    console.log(
      `  ${l.cenik} | ${l.nazev} | qty=${l.mnozMj} | price=${l.cenaMj} | VAT%=${l.szbDph} | sklad=${l.sklad} | rezervovat=${l.rezervovat}/${l.rezervovatMj}`,
    )
  }
  console.log('=================================================')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(2)
  })
  .finally(() => prisma.$disconnect())
