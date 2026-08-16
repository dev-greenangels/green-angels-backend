/**
 * Late-conflict demo: firma + CUPR-LEYL-C2 (known free dostupMj).
 * A: rezervovat true; B: false. KEEP.
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

  const sample = await req('GET', '/objednavka-prijata/65.json?detail=custom:firma,typDokl,mena,stredisko')
  const sampleDoc = (win(sample.json)['objednavka-prijata'] as unknown[])?.[0] as Record<
    string,
    unknown
  >

  const skuA = 'CUPR-LEYL-C2'
  const skuB = 'CUPR-LEYL-C2'
  const tag = randomUUID().slice(0, 8)
  const ext = `ext:GA-SPIKE-LC6-${tag}`

  const put = await req('PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [
        {
          id: ext,
          typDokl: sampleDoc?.typDokl ?? 'code:OBP',
          firma: sampleDoc?.firma,
          datVyst: new Date().toISOString().slice(0, 10),
          popis: `LATE-CONFLICT DEMO ${tag}: line1 On stock reservation=YES, line2=NO`,
          stavUzivK: 'stavDoklObch.schvaleno',
          mena: sampleDoc?.mena,
          stredisko: sampleDoc?.stredisko,
          polozkyObchDokladu: [
            {
              cenik: `code:${skuA}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `[YES reserve] ${skuA}`,
              sklad: `code:${cfg.stock}`,
              rezervovat: true,
              rezervovatMj: 1,
              typCenyDphK: 'typCeny.sDph',
            },
            {
              cenik: `code:${skuB}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `[NO reserve / late-conflict] ${skuB}`,
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
  console.log('PUT', put.status, ok, 'id=', id)
  if (!ok) {
    console.log(JSON.stringify(root).slice(0, 1000))
    return
  }

  const g = await req(
    'GET',
    `/objednavka-prijata/${id}.json?detail=custom:id,kod,firma,popis,polozkyObchDokladu(id,nazev,rezervovat,rezervovatMj)`,
  )
  const doc = (win(g.json)['objednavka-prijata'] as unknown[])?.[0] as Record<string, unknown>
  console.log('\n======== OPEN THIS IN FLEXI ========')
  console.log(`Document number (kod): ${doc?.kod}`)
  console.log(`Internal id: ${doc?.id}`)
  console.log(`Customer: ${doc?.firma}`)
  console.log(`Description: ${doc?.popis}`)
  console.log('Lines:')
  for (const l of (doc?.polozkyObchDokladu as Array<Record<string, unknown>>) ?? []) {
    console.log(`  • ${l.nazev}`)
    console.log(`    On stock reservation = ${l.rezervovat}  (qty ${l.rezervovatMj})`)
  }
  console.log('===================================')
  console.log('(Not deleted — inspect then delete manually if you want)')
}

main().finally(() => prisma.$disconnect())
