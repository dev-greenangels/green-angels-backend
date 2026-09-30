import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { FlexiEvidenceRegistry } from './flexi-evidence.registry'
import type { FlexiEvidenceHandler, FlexiRefreshOutcome } from './flexi-evidence.handler'

function mockHandler(
  partial: Partial<FlexiEvidenceHandler> & Pick<FlexiEvidenceHandler, 'evidences' | 'matches'>,
): FlexiEvidenceHandler {
  return {
    liveSync: true,
    includeInFullRefresh: false,
    includeInOffReconcile: false,
    coalesceKey: (evidence, objectId) => `${evidence}:${objectId}`,
    refreshCurrentState: async () => ({ status: 'updated' }) as FlexiRefreshOutcome,
    ...partial,
  }
}

describe('FlexiEvidenceRegistry', () => {
  it('resolves supported evidences and ignores unsupported', () => {
    const cenik = mockHandler({
      evidences: ['cenik'],
      matches: (e) => e.includes('cenik') && !e.includes('strom-cenik'),
    })
    const order = mockHandler({
      evidences: ['objednavka-prijata'],
      matches: (e) => e === 'objednavka-prijata',
    })
    const registry = new FlexiEvidenceRegistry([cenik, order])

    assert.equal(registry.resolve('cenik'), cenik)
    assert.equal(registry.resolve('objednavka-prijata'), order)
    assert.equal(registry.resolve('faktura-vydana'), null)
    assert.equal(registry.resolve('strom-cenik'), null)
    assert.deepEqual(registry.listRegistered().sort(), ['cenik', 'objednavka-prijata'])
  })

  it('coalesce keys collapse same object', () => {
    const cenik = mockHandler({
      evidences: ['cenik'],
      matches: (e) => e.includes('cenik'),
      coalesceKey: (_e, id) => `cenik:${id}`,
    })
    const keys = ['123', '123', '123'].map((id) => cenik.coalesceKey('cenik', id))
    assert.equal(new Set(keys).size, 1)
  })
})
