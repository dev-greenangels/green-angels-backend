import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { FlexiCenikEvidenceHandler } from './flexi-cenik.evidence-handler'

describe('FlexiCenikEvidenceHandler', () => {
  it('applies current cenik item on refresh', async () => {
    const calls: string[] = []
    const client = {
      fetchCenikById: async (id: string) => {
        calls.push(`get:${id}`)
        return { id, kod: 'SKU-1', nazev: 'Plant', stock: 17, price: 10, cnCode: null, weight: null, quantityPrices: [] }
      },
    }
    const flexi = {
      applyCenikItem: async (item: { kod: string; stock: number }) => {
        calls.push(`apply:${item.kod}:${item.stock}`)
        return 'updated' as const
      },
      syncCenikFull: async () => ({ ok: true, itemsSynced: 1, unmatched: 0, message: 'ok' }),
    }
    const handler = new FlexiCenikEvidenceHandler(client as never, flexi as never)
    const result = await handler.refreshCurrentState('cenik', '99', { allowRetry: false })
    assert.equal(result.status, 'updated')
    assert.deepEqual(calls, ['get:99', 'apply:SKU-1:17'])
  })

  it('treats missing cenik as missing not throw', async () => {
    const client = {
      fetchCenikById: async () => null,
    }
    const flexi = {
      applyCenikItem: async () => {
        throw new Error('should not apply')
      },
      syncCenikFull: async () => ({ ok: true, itemsSynced: 0, unmatched: 0, message: 'ok' }),
    }
    const handler = new FlexiCenikEvidenceHandler(client as never, flexi as never)
    const result = await handler.refreshCurrentState('cenik', 'gone', {
      allowRetry: true,
      operation: 'delete',
    })
    assert.equal(result.status, 'missing')
  })

  it('rethrows transient errors when allowRetry', async () => {
    const client = {
      fetchCenikById: async () => {
        throw new Error('ECONNRESET')
      },
    }
    const flexi = {
      applyCenikItem: async () => 'updated' as const,
      syncCenikFull: async () => ({ ok: true, itemsSynced: 0, unmatched: 0, message: 'ok' }),
    }
    const handler = new FlexiCenikEvidenceHandler(client as never, flexi as never)
    await assert.rejects(
      () => handler.refreshCurrentState('cenik', '1', { allowRetry: true }),
      /ECONNRESET/,
    )
  })
})
