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
  const ext = `ext:GA-SPIKE-G-${Date.now()}`

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
            id: ext,
            typDokl: 'code:OBP',
            datVyst: new Date().toISOString().slice(0, 10),
            stavUzivK: 'stavDoklObch.schvaleno',
            polozkyObchDokladu: [
              {
                cenik: 'code:PENN-ALO-LADYU-CUT',
                mnozMj: 1,
                cenaMj: 1,
                sklad: 'code:WHMAIN',
              },
            ],
          },
        ],
      },
    }),
  })
  const pj = (await put.json()) as {
    winstrom?: { results?: Array<{ id?: string }> }
  }
  const id = pj.winstrom?.results?.[0]?.id
  console.log('created', id, ext)

  const paths = [
    `/objednavka-prijata/${ext}.json?detail=custom:id,kod`,
    `/objednavka-prijata/${encodeURIComponent(ext)}.json?detail=custom:id,kod`,
    `/objednavka-prijata/(id='${ext}').json?detail=custom:id,kod`,
    `/objednavka-prijata/(${encodeURIComponent(`id='${ext}'`)}).json?detail=custom:id,kod`,
  ]
  for (const path of paths) {
    const r = await fetch(`${base}${path}`, {
      headers: { Authorization: auth, Accept: 'application/json' },
    })
    const j = (await r.json()) as { winstrom?: { 'objednavka-prijata'?: unknown } }
    const rows = j.winstrom?.['objednavka-prijata']
    const n = Array.isArray(rows) ? rows.length : rows ? 1 : 0
    console.log(`HTTP ${r.status} rows=${n} path=${path}`)
  }

  if (id) {
    await fetch(`${base}/objednavka-prijata.json`, {
      method: 'PUT',
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        winstrom: {
          '@version': '1.0',
          'objednavka-prijata': [{ '@action': 'delete', id: String(id) }],
        },
      }),
    })
    console.log('deleted', id)
  }
}

main().finally(() => prisma.$disconnect())
