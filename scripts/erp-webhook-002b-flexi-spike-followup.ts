/**
 * Follow-up spike: skladova-karta → cenik + DELETE hooks probe.
 */
import { PrismaClient } from '@prisma/client'
import { decryptSecret, resolveFlexiSecretsKey } from '../src/flexi/flexi.crypto'

const prisma = new PrismaClient()

async function main() {
  const row = await prisma.settings.findUnique({ where: { key: 'integration.flexi' } })
  const raw = JSON.parse(row!.value) as Record<string, unknown>
  const key = resolveFlexiSecretsKey()!
  const password = decryptSecret(String(raw.password ?? ''), key)
  const base = `${String(raw.baseUrl).replace(/\/$/, '')}/c/${encodeURIComponent(String(raw.companyId))}`
  const auth = 'Basic ' + Buffer.from(`${raw.username}:${password}`).toString('base64')

  async function get(path: string) {
    const res = await fetch(base + path, {
      headers: { Authorization: auth, Accept: 'application/json' },
    })
    const text = await res.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      /* ignore */
    }
    return { status: res.status, json, text: text.slice(0, 2000) }
  }

  const list = await get(
    '/skladova-karta.json?limit=2&detail=custom:id,cenik,cenik(kod),dostupMj,stavMJ',
  )
  console.log('skladova-karta list HTTP', list.status)
  console.log(JSON.stringify(list.json, null, 2).slice(0, 2500))

  const ch = await get('/changes.json?start=0&limit=500')
  const w = ch.json?.winstrom ?? ch.json
  const changes = Array.isArray(w.change) ? w.change : []
  const sklad = changes
    .filter((c: any) => String(c['@evidence'] || '').includes('sklad'))
    .slice(0, 2)
  console.log('sklad change samples', JSON.stringify(sklad))
  if (sklad[0]?.id != null) {
    const id = String(sklad[0].id)
    const one = await get(
      `/skladova-karta/${encodeURIComponent(id)}.json?detail=custom:id,cenik,cenik(kod),dostupMj,stavMJ`,
    )
    console.log('one card HTTP', one.status, JSON.stringify(one.json).slice(0, 1500))
  }

  const del = await fetch(`${base}/hooks/999999999.json`, {
    method: 'DELETE',
    headers: { Authorization: auth, Accept: 'application/json' },
  })
  console.log('DELETE nonexistent hook HTTP', del.status, (await del.text()).slice(0, 400))
}

main()
  .catch(console.error)
  .finally(() => {
    void prisma.$disconnect()
  })
