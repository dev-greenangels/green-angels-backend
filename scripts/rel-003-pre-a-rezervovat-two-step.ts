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

  // Create bare order (no rezervovat fields), two lines same free SKU
  const sku = 'CUPR-LEYL-C2'
  const tag = Date.now().toString(36)
  const ext = `ext:GA-SPIKE-LC4-${tag}`
  const put = await req('PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [
        {
          id: ext,
          typDokl: 'code:OBP',
          datVyst: new Date().toISOString().slice(0, 10),
          popis: `LC4 ${tag}: create bare then set lineA rezervovat=true lineB=false`,
          stavUzivK: 'stavDoklObch.schvaleno',
          polozkyObchDokladu: [
            {
              cenik: `code:${sku}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `[A will reserve] ${sku}`,
              sklad: `code:${cfg.stock}`,
            },
            {
              cenik: `code:${sku}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `[B no reserve] ${sku}`,
              sklad: `code:${cfg.stock}`,
            },
          ],
        },
      ],
    },
  })
  const root = win(put.json)
  const id = (root.results as Array<{ id?: string }>)?.[0]?.id
  console.log('create', put.status, root.success, id, ext)
  if (!id) {
    console.log(JSON.stringify(root).slice(0, 800))
    return
  }

  const g0 = await req(
    'GET',
    `/objednavka-prijata/${id}.json?detail=custom:kod,polozkyObchDokladu(id,nazev,rezervovat,rezervovatMj)`,
  )
  const doc0 = (win(g0.json)['objednavka-prijata'] as unknown[])?.[0] as Record<string, unknown>
  const lines = doc0?.polozkyObchDokladu as Array<Record<string, unknown>>
  console.log('after create', doc0?.kod, lines)

  const lineA = lines[0]?.id
  const lineB = lines[1]?.id

  // Update only reservation flags
  const upd = await req('PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [
        {
          id: String(id),
          polozkyObchDokladu: [
            { id: String(lineA), rezervovat: true, rezervovatMj: 1 },
            { id: String(lineB), rezervovat: false, rezervovatMj: 0 },
          ],
        },
      ],
    },
  })
  console.log('update flags', upd.status, JSON.stringify(win(upd.json)).slice(0, 600))

  const g1 = await req(
    'GET',
    `/objednavka-prijata/${id}.json?detail=custom:kod,popis,polozkyObchDokladu(id,nazev,rezervovat,rezervovatMj)`,
  )
  const doc1 = (win(g1.json)['objednavka-prijata'] as unknown[])?.[0] as Record<string, unknown>
  console.log('\n=== FINAL', doc1?.kod, 'id=', id, '===')
  for (const l of (doc1?.polozkyObchDokladu as Array<Record<string, unknown>>) ?? []) {
    console.log(`  ${l.nazev} → rezervovat=${l.rezervovat} mj=${l.rezervovatMj}`)
  }

  // Compare rezervace count before? just list recent for CUPR
  const rez = await req(
    'GET',
    `/rezervace.json?limit=5&order=id@D&detail=custom:id,cenik,mnozstvi,lastUpdate`,
  )
  console.log('\nlatest rezervace', JSON.stringify(win(rez.json).rezervace, null, 2)?.slice(0, 800))
}

main().finally(() => prisma.$disconnect())
