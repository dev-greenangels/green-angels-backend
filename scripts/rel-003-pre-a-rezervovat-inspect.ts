/**
 * Inspect OBP0062/2026 + create control order with stavDoklObch.schvaleno
 * (one line rezervovat true, one false). KEEP both.
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
    const text = await res.text()
    let json: unknown = null
    try {
      json = JSON.parse(text)
    } catch {
      /* ignore */
    }
    return { status: res.status, json }
  }
  const win = (j: unknown) =>
    ((j as { winstrom?: Record<string, unknown> })?.winstrom ?? {}) as Record<string, unknown>

  // Full detail on existing demo
  console.log('=== Inspect existing id=70 ===')
  const g70 = await req('GET', '/objednavka-prijata/70.json?detail=full')
  const d70 = (win(g70.json)['objednavka-prijata'] as unknown[])?.[0] as Record<string, unknown>
  const lines70 = (d70?.polozkyObchDokladu ?? []) as Array<Record<string, unknown>>
  for (const l of Array.isArray(lines70) ? lines70 : [lines70]) {
    console.log({
      id: l.id,
      nazev: l.nazev,
      rezervovat: l.rezervovat,
      rezervovatMj: l.rezervovatMj,
      cenik: l.cenik,
      sklad: l.sklad,
    })
  }

  // Control: schvaleno + mixed rezervovat
  const cenik = await req(
    'GET',
    '/cenik.json?limit=10&detail=custom:kod,nazev,sumDostupMj&order=sumDostupMj@D',
  )
  const items = (win(cenik.json).cenik as Array<{ kod?: string; nazev?: string; sumDostupMj?: number }>) ?? []
  const withStock = items.filter((i) => i.kod && Number(i.sumDostupMj ?? 0) >= 1)
  const skuA = withStock[0]!
  const skuB = withStock[1]!
  const tag = randomUUID().slice(0, 8)
  const ext = `ext:GA-SPIKE-LC2-${tag}`

  console.log('\n=== Create control schvaleno mixed rezervovat ===')
  const put = await req('PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [
        {
          id: ext,
          typDokl: 'code:OBP',
          datVyst: new Date().toISOString().slice(0, 10),
          popis: `REL-003 LC2 ${tag}: A rezervovat=true, B=false (schvaleno)`,
          stavUzivK: 'stavDoklObch.schvaleno',
          polozkyObchDokladu: [
            {
              cenik: `code:${skuA.kod}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `[YES] ${skuA.kod}`,
              sklad: `code:${cfg.stock}`,
              rezervovat: true,
              rezervovatMj: 1,
            },
            {
              cenik: `code:${skuB.kod}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `[NO] ${skuB.kod}`,
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
  const ok = root.success === true || root.success === 'true'
  const id = (root.results as Array<{ id?: string }>)?.[0]?.id
  console.log('PUT', put.status, ok, 'id=', id, 'ext=', ext)
  if (!ok) {
    console.log(JSON.stringify(root).slice(0, 800))
    return
  }

  const g = await req('GET', `/objednavka-prijata/${id}.json?detail=full`)
  const doc = (win(g.json)['objednavka-prijata'] as unknown[])?.[0] as Record<string, unknown>
  console.log(`kod=${doc?.kod} stavUzivK=${doc?.stavUzivK}`)
  const lines = doc?.polozkyObchDokladu as Array<Record<string, unknown>>
  for (const l of Array.isArray(lines) ? lines : [lines]) {
    console.log({
      id: l.id,
      nazev: l.nazev,
      rezervovat: l.rezervovat,
      rezervovatMj: l.rezervovatMj,
    })
  }

  // Try reservations evidence if exists
  for (const path of [
    `/rezervace.json?limit=10&detail=full&filter=${encodeURIComponent(`doklObch=${id}`)}`,
    `/rezervace.json?limit=10&order=id@D&detail=custom:id,cenik,sklad,mnozMj,doklObch`,
  ]) {
    const r = await req('GET', path)
    console.log('\nreservations probe', path.slice(0, 60), 'HTTP', r.status)
    console.log(JSON.stringify(win(r.json)).slice(0, 500))
  }

  console.log('\nKEEP both demos in Flexi:')
  console.log('  OBP0062/2026 (id=70, nespec) — inspect lines')
  console.log(`  ${(doc as { kod?: string })?.kod} (id=${id}, schvaleno) — inspect On stock reservation`)
}

main().finally(() => prisma.$disconnect())
