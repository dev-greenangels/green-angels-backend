/**
 * Find SKUs with free stock for reservation, create mixed rezervovat order, KEEP.
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
    const json = await res.json()
    return { status: res.status, json }
  }
  const win = (j: unknown) =>
    ((j as { winstrom?: Record<string, unknown> })?.winstrom ?? {}) as Record<string, unknown>

  // Stock cards: dostupMj and rezervovanoMj
  const period = await req('GET', '/ucetni-obdobi.json?limit=1&detail=custom:id,platiOdData&order=platiOdData@D')
  const periods = win(period.json)['ucetni-obdobi'] as Array<{ id?: string }>
  const periodId = periods?.[0]?.id
  console.log('period', periodId)

  const cards = await req(
    'GET',
    `/skladova-karta.json?limit=40&detail=custom:cenik(kod),sklad(kod),stavMJ,dostupMj,rezervovanoMj&order=dostupMj@D`,
  )
  const rows = (win(cards.json)['skladova-karta'] ?? []) as Array<Record<string, unknown>>
  const candidates: Array<{ kod: string; dostup: number; rezerv: number; stav: number }> = []
  for (const r of Array.isArray(rows) ? rows : []) {
    const cenik = String(r['cenik@showAs'] ?? r.cenik ?? '')
    const kodMatch = cenik.match(/^([^:]+)/)
    const kod =
      typeof r.cenik === 'string' && r.cenik.startsWith('code:')
        ? r.cenik.slice(5)
        : kodMatch?.[1]?.trim() ?? ''
    const dostup = Number(r.dostupMj ?? 0)
    const rezerv = Number(r.rezervovanoMj ?? 0)
    const stav = Number(r.stavMJ ?? 0)
    const sklad = String(r.sklad ?? r['sklad@showAs'] ?? '')
    if (!kod || dostup < 1) continue
    if (!sklad.includes(cfg.stock) && !sklad.includes('WHMAIN')) continue
    candidates.push({ kod, dostup, rezerv, stav })
  }
  candidates.sort((a, b) => b.dostup - a.dostup)
  console.log('top free stock cards:', candidates.slice(0, 8))

  if (candidates.length < 2) {
    console.log('FALLBACK: use cenik sumDostupMj')
  }
  const a = candidates[0] ?? { kod: 'PENN-ALO-LADYU-CUT', dostup: 1, rezerv: 0, stav: 1 }
  const b = candidates[1] ?? { kod: 'CUPR-LEYL-C2', dostup: 1, rezerv: 0, stav: 1 }

  const tag = randomUUID().slice(0, 8)
  const ext = `ext:GA-SPIKE-LC3-${tag}`
  console.log(`\nCreating mixed order A=${a.kod} (reserve) B=${b.kod} (no reserve)`)

  const put = await req('PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [
        {
          id: ext,
          typDokl: 'code:OBP',
          datVyst: new Date().toISOString().slice(0, 10),
          popis: `LATE-CONFLICT DEMO ${tag}: A On stock reservation=YES, B=NO`,
          stavUzivK: 'stavDoklObch.schvaleno',
          polozkyObchDokladu: [
            {
              cenik: `code:${a.kod}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `[RESERVE YES] ${a.kod}`,
              sklad: `code:${cfg.stock}`,
              rezervovat: 'true',
              rezervovatMj: 1,
            },
            {
              cenik: `code:${b.kod}`,
              mnozMj: 1,
              cenaMj: 1,
              nazev: `[RESERVE NO / late-conflict] ${b.kod}`,
              sklad: `code:${cfg.stock}`,
              rezervovat: 'false',
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
  console.log('PUT', put.status, ok, 'id=', id)
  if (!ok) {
    console.log(JSON.stringify(root).slice(0, 1000))
    return
  }

  const g = await req(
    'GET',
    `/objednavka-prijata/${id}.json?detail=custom:id,kod,stavUzivK,popis,polozkyObchDokladu(id,nazev,cenik,rezervovat,rezervovatMj)`,
  )
  const doc = (win(g.json)['objednavka-prijata'] as unknown[])?.[0] as Record<string, unknown>
  console.log(`\n=== LOOK IN FLEXI: ${doc?.kod} (id=${id}) ===`)
  console.log(doc?.popis)
  for (const l of (doc?.polozkyObchDokladu as Array<Record<string, unknown>>) ?? []) {
    console.log(`  ${l.nazev} → On stock reservation rezervovat=${l.rezervovat} mj=${l.rezervovatMj}`)
  }
  console.log('\nAlso still present from earlier:')
  console.log('  OBP0062/2026 (id=70) nespec')
  console.log('  OBP0063/2026 (id=71) schvaleno — both lines false (could not reserve)')
}

main().finally(() => prisma.$disconnect())
