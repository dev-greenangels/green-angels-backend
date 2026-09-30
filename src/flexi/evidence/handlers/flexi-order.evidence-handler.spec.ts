import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { FlexiOrderEvidenceHandler } from './flexi-order.evidence-handler'

describe('FlexiOrderEvidenceHandler', () => {
  it('delegates to syncOrderFromFlexi for current state', async () => {
    const seen: string[] = []
    const flexi = {
      syncOrderFromFlexi: async (id: string) => {
        seen.push(id)
      },
    }
    const handler = new FlexiOrderEvidenceHandler(flexi as never)
    const result = await handler.refreshCurrentState('objednavka-prijata', 'ext:GA:abc', {
      allowRetry: false,
    })
    assert.equal(result.status, 'updated')
    assert.deepEqual(seen, ['ext:GA:abc'])
  })

  it('is not part of catalog full refresh', async () => {
    const handler = new FlexiOrderEvidenceHandler({ syncOrderFromFlexi: async () => undefined } as never)
    assert.equal(handler.includeInFullRefresh, false)
    assert.equal(handler.includeInOffReconcile, true)
    const part = await handler.runFullRefresh!()
    assert.equal(part.ok, true)
    assert.match(part.message, /order reconcile/i)
  })
})
