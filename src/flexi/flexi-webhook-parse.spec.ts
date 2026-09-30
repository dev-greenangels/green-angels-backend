import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  expandFlexiChangeRow,
  parseFlexiWebhookBody,
  pickFlexiObjectId,
} from './flexi-webhook-parse'

describe('flexi webhook parse', () => {
  it('parses winstrom.change array with @in-version', () => {
    const parsed = parseFlexiWebhookBody({
      winstrom: {
        change: [
          {
            evidence: 'cenik',
            id: '123',
            operation: 'update',
            '@in-version': '42117',
            globalVersion: 42000,
          },
        ],
        next: 42118,
      },
    })
    assert.equal(parsed.length, 1)
    assert.equal(parsed[0]!.evidence, 'cenik')
    assert.equal(parsed[0]!.id, '123')
    assert.equal(parsed[0]!.inVersion, 42117)
    assert.equal(parsed[0]!.operation, 'update')
  })

  it('expands multiple ids into separate notifications', () => {
    const rows = expandFlexiChangeRow({
      evidence: 'cenik',
      id: ['10', '20'],
      operation: 'update',
    })
    assert.deepEqual(
      rows.map((r) => r.id),
      ['10', '20'],
    )
  })

  it('handles single change object (not array)', () => {
    const parsed = parseFlexiWebhookBody({
      winstrom: {
        change: { evidence: 'objednavka-prijata', id: 'ext:GA:abc', operation: 'update' },
      },
    })
    assert.equal(parsed.length, 1)
    assert.equal(parsed[0]!.id, 'ext:GA:abc')
  })

  it('pickFlexiObjectId ignores empties', () => {
    assert.equal(pickFlexiObjectId(null), null)
    assert.equal(pickFlexiObjectId(['', '42']), '42')
    assert.equal(pickFlexiObjectId({ id: 99 }), '99')
  })

  it('strom notification without id is still parseable', () => {
    const parsed = parseFlexiWebhookBody({
      winstrom: { changes: [{ evidence: 'strom', operation: 'update', '@in-version': 5 }] },
    })
    assert.equal(parsed[0]!.evidence, 'strom')
    assert.equal(parsed[0]!.id, undefined)
  })
})
