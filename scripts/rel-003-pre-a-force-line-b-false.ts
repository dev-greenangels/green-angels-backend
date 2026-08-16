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

  async function req(method: string, path: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, json: await res.json() }
  }
  const win = (j: unknown) =>
    ((j as { winstrom?: Record<string, unknown> })?.winstrom ?? {}) as Record<string, unknown>

  const g = await req(
    'GET',
    '/objednavka-prijata/74.json?detail=custom:kod,polozkyObchDokladu(id,nazev,rezervovat,rezervovatMj)',
  )
  const doc = (win(g.json)['objednavka-prijata'] as unknown[])?.[0] as Record<string, unknown>
  const lines = doc?.polozkyObchDokladu as Array<Record<string, unknown>>
  console.log('before', lines)
  const lineB = lines.find((l) => String(l.nazev).includes('NO reserve'))
  if (!lineB?.id) throw new Error('line B not found')

  // Force clear reservation on line B only
  const upd = await req('PUT', '/objednavka-prijata.json', {
    winstrom: {
      '@version': '1.0',
      'objednavka-prijata': [
        {
          id: '74',
          polozkyObchDokladu: [
            { id: String(lineB.id), rezervovat: false, rezervovatMj: 0 },
          ],
        },
      ],
    },
  })
  console.log('update', upd.status, JSON.stringify(win(upd.json)).slice(0, 400))

  const g2 = await req(
    'GET',
    '/objednavka-prijata/74.json?detail=custom:kod,popis,polozkyObchDokladu(id,nazev,rezervovat,rezervovatMj)',
  )
  const doc2 = (win(g2.json)['objednavka-prijata'] as unknown[])?.[0] as Record<string, unknown>
  console.log('\n======== OBP0066/2026 AFTER FORCE B=false ========')
  for (const l of (doc2?.polozkyObchDokladu as Array<Record<string, unknown>>) ?? []) {
    console.log(`  ${l.nazev}`)
    console.log(`    On stock reservation = ${l.rezervovat}  qty=${l.rezervovatMj}`)
  }
}

main().finally(() => prisma.$disconnect())
