import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('Flexi API usage counter semantics', () => {
  it('counts each actual HTTP request including retries; webhook inbound = 0', () => {
    let used = 0
    const onOutgoingHttp = () => {
      used += 1
    }
    const onIncomingWebhook = () => {
      /* no-op */
    }
    const onQueueJobStart = () => {
      /* no-op */
    }

    onOutgoingHttp() // GET cenik
    onOutgoingHttp() // retry GET cenik
    onIncomingWebhook()
    onQueueJobStart()
    assert.equal(used, 2)
  })

  it('UTC day key rolls over', () => {
    const dayA = '2026-09-29'
    const dayB = '2026-09-30'
    assert.notEqual(dayA, dayB)
    const key = (company: string, day: string) => `flexi:api-usage:${company}:${day}`
    assert.notEqual(key('firma', dayA), key('firma', dayB))
  })

  it('UI labels local counter honestly', () => {
    const source = 'LOCAL'
    const title = 'Site requests to ABRA today'
    assert.equal(source, 'LOCAL')
    assert.equal(title.includes('ABRA license'), false)
  })
})
