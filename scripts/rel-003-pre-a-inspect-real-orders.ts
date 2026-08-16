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
  }
  const auth = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')
  const base = `${cfg.baseUrl}/c/${encodeURIComponent(cfg.companyId)}`

  async function get(path: string) {
    const r = await fetch(`${base}${path}`, {
      headers: { Authorization: auth, Accept: 'application/json' },
    })
    return { status: r.status, json: await r.json() }
  }
  const win = (j: unknown) =>
    ((j as { winstrom?: Record<string, unknown> })?.winstrom ?? {}) as Record<string, unknown>

  // Recent non-spike orders
  const list = await get(
    '/objednavka-prijata.json?limit=15&order=id@D&detail=custom:id,kod,popis,stavUzivK',
  )
  const docs = (win(list.json)['objednavka-prijata'] ?? []) as Array<Record<string, unknown>>
  console.log('recent orders:')
  for (const d of docs) {
    console.log(`  ${d.kod} id=${d.id} ${String(d.popis ?? '').slice(0, 60)}`)
  }

  // Inspect a few for rezervovat on lines
  for (const d of docs.slice(0, 6)) {
    const g = await get(
      `/objednavka-prijata/${d.id}.json?detail=custom:id,kod,polozkyObchDokladu(id,nazev,cenik,rezervovat,rezervovatMj)`,
    )
    const doc = (win(g.json)['objednavka-prijata'] as unknown[])?.[0] as Record<string, unknown>
    const lines = (doc?.polozkyObchDokladu ?? []) as Array<Record<string, unknown>>
    const flags = (Array.isArray(lines) ? lines : [lines]).map(
      (l) => `${l.rezervovat}/${l.rezervovatMj}`,
    )
    console.log(`  ${d.kod} line rezervovat flags:`, flags.join(', '))
  }

  // relations / actions
  const rel = await get('/objednavka-prijata/relations.json')
  console.log('\nrelations keys', Object.keys(win(rel.json)))
  console.log(JSON.stringify(win(rel.json)).slice(0, 1500))
}

main().finally(() => prisma.$disconnect())
