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
    return { status: r.status, json: (await r.json()) as Record<string, unknown> }
  }

  for (const path of [
    '/objednavka-prijata-polozka/properties.json',
    '/polozka-obch-dokladu/properties.json',
  ]) {
    const r = await get(path)
    console.log(path, r.status)
    const w = (r.json.winstrom ?? {}) as Record<string, unknown>
    const props = (w.properties ?? w.property ?? []) as Array<Record<string, unknown>>
    const arr = Array.isArray(props) ? props : [props]
    const hits = arr.filter((x) => /rezerv|stock/i.test(JSON.stringify(x)))
    console.log(
      'rezerv-related:',
      hits.map((h) => `${h.propertyName ?? h.name}:${h.type ?? h['@type'] ?? ''}`),
    )
  }

  for (const id of [70, 71]) {
    for (const f of [`doklObch=${id}`, `doklObch='${id}'`]) {
      const r = await get(
        `/rezervace/(${encodeURIComponent(f)}).json?limit=20&detail=custom:id,cenik,mnozstvi,skladMj,doklObch`,
      )
      const w = (r.json.winstrom ?? {}) as Record<string, unknown>
      const rows = w.rezervace
      const n = Array.isArray(rows) ? rows.length : rows ? 1 : 0
      console.log(`rezervace ${f} → HTTP ${r.status} n=${n}`, n ? rows : '')
    }
  }

  const recent = await get(
    '/rezervace.json?limit=8&order=id@D&detail=custom:id,cenik,mnozstvi,skladMj,doklObch,lastUpdate',
  )
  console.log(
    'recent rezervace',
    JSON.stringify((recent.json.winstrom as Record<string, unknown>)?.rezervace, null, 2)?.slice(
      0,
      2000,
    ),
  )

  // PATCH line 76 to force rezervovat true via update
  console.log('\n=== Force update line 76 rezervovat=true ===')
  const put = await fetch(`${base}/objednavka-prijata.json`, {
    method: 'PUT',
    headers: {
      Authorization: auth,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      winstrom: {
        '@version': '1.0',
        'objednavka-prijata': [
          {
            id: '71',
            polozkyObchDokladu: [
              { id: '76', rezervovat: true, rezervovatMj: 1 },
              { id: '77', rezervovat: false, rezervovatMj: 0 },
            ],
          },
        ],
      },
    }),
  })
  const pj = await put.json()
  console.log('update HTTP', put.status, JSON.stringify(pj).slice(0, 400))
  const g = await get(
    '/objednavka-prijata/71.json?detail=custom:id,kod,polozkyObchDokladu(id,nazev,rezervovat,rezervovatMj)',
  )
  console.log(JSON.stringify(g.json, null, 2).slice(0, 1500))
}

main().finally(() => prisma.$disconnect())
