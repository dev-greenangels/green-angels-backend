/**
 * Late-conflict demo WITH firma (required for reservation to stick — like e-shop export).
 * Line A: rezervovat true; Line B: rezervovat false. KEEP in Flexi.
 */
import { randomUUID } from 'crypto'
import { PrismaClient } from '@prisma/client'
import { decryptSecret, resolveFlexiSecretsKey } from '../src/flexi/flexi.crypto'

const prisma = new PrismaClient()

async function main() {
  const row = await prisma.settings.findUnique({ where: { key: 'integration.flexi' } })
  const raw = JSON.parse(row!.value) as Record<string, unknown>
  const cfg = {
    baseUrl: String(raw.baseUrl).replace(/\/$/, ''),
    companyId: String(raw.companyId),
    username: String(raw.username),
    password: decryptSecret(String(raw.password), resolveFlexiSecretsKey()!),
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

  // Reuse firma from a working e-shop order
  const sample = await req(
    'GET',
    '/objednavka-prijata/65.json?detail=custom:id,kod,firma,typDokl,mena,stredisko,polozkyObchDokladu(cenik,sklad,rezervovat,rezervovatMj,typCenyDphK)',
  )
  const sampleDoc = (win(sample.json)['objednavka-prijata'] as unknown[])?.[0] as Record<
    string,
    unknown
  >
  console.log('sample e-shop OBP0061 firma=', sampleDoc?.firma, 'typDokl=', sampleDoc?.typDokl)
  console.log('sample line0', (sampleDoc?.polozkyObchDokladu as unknown[])?.[0])

  const firma = sampleDoc?.firma
  if (!firma) throw new Error('no firma on sample order')

  // Two different SKUs from recent reserved e-shop if possible
  const cenik = await req(
    'GET',
    '/cenik.json?limit=20&detail=custom:kod,sumDostupMj&order=sumDostupMj@D',
  )
  const items = (win(cenik.json).cenik as Array<{ kod?: string; sumDostupMj?: number }>) ?? []
  const skus = items.filter((i) => i.kod && Number(i.sumDostupMj ?? 0) >= 2).slice(0, 2)
  const skuA = skus[0]?.kod ?? 'CUPR-LEYL-C2'
  const skuB = skus[1]?.kod ?? skus[0]?.kod ?? 'CUPR-LEYL-C2'

  const tag = randomUUID().slice(0, 8)
  const ext = `ext:GA-SPIKE-LC5-${tag}`

  const put = await req('PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [
        {
          id: ext,
          typDokl: sampleDoc?.typDokl ?? 'code:OBP',
          firma,
          datVyst: new Date().toISOString().slice(0, 10),
          popis: `LATE-CONFLICT ${tag}: A reserved=YES, B reserved=NO (with firma)`,
          stavUzivK: 'stavDoklObch.schvaleno',
          mena: sampleDoc?.mena,
          stredisko: sampleDoc?.stredisko,
          polozkyObchDokladu: [
            {
              cenik: `code:${skuA}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `[RESERVE YES] ${skuA}`,
              sklad: `code:${cfg.stock}`,
              rezervovat: true,
              rezervovatMj: 1,
              typCenyDphK: 'typCeny.sDph',
            },
            {
              cenik: `code:${skuB}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `[RESERVE NO / late-conflict] ${skuB}`,
              sklad: `code:${cfg.stock}`,
              rezervovat: false,
              rezervovatMj: 0,
              typCenyDphK: 'typCeny.sDph',
            },
          ],
        },
      ],
    },
  })

  const root = win(put.json)
  const ok = root.success === true || root.success === 'true'
  const id = (root.results as Array<{ id?: string }>)?.[0]?.id
  console.log('PUT', put.status, ok, 'id=', id, 'ext=', ext)
  if (!ok) {
    console.log(JSON.stringify(root).slice(0, 1200))
    return
  }

  const g = await req(
    'GET',
    `/objednavka-prijata/${id}.json?detail=custom:id,kod,firma,popis,stavUzivK,polozkyObchDokladu(id,nazev,cenik,rezervovat,rezervovatMj)`,
  )
  const doc = (win(g.json)['objednavka-prijata'] as unknown[])?.[0] as Record<string, unknown>
  console.log('\n======== OPEN IN FLEXI ========')
  console.log(`kod: ${doc?.kod}`)
  console.log(`id:  ${doc?.id}`)
  console.log(`firma: ${doc?.firma}`)
  console.log(`popis: ${doc?.popis}`)
  for (const l of (doc?.polozkyObchDokladu as Array<Record<string, unknown>>) ?? []) {
    console.log(
      `  ${l.nazev}\n    On stock reservation = ${l.rezervovat} (rezervovatMj=${l.rezervovatMj})`,
    )
  }
  console.log('================================')
}

main().finally(() => prisma.$disconnect())
