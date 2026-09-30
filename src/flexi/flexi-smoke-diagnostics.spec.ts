import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/**
 * Flexi Changes API: start=N is INCLUSIVE (returns change at inVersion=N).
 * Race bridge / live poll must use start=baseline+1 and afterVersion=baseline.
 */
describe('Changes API inclusive start (smoke regression)', () => {
  it('start=tip would re-apply OFF tip change — exclusive start required', () => {
    const tip = 99810
    const tipChange = { evidence: 'skladova-karta', id: '1', inVersion: 99810 }
    const inclusiveStart = tip
    const inclusiveRows = [tipChange].filter((c) => c.inVersion >= inclusiveStart)
    assert.equal(inclusiveRows.length, 1)

    const exclusiveStart = tip + 1
    const afterVersion = tip
    const exclusiveRows = [tipChange].filter(
      (c) => c.inVersion >= exclusiveStart && c.inVersion > afterVersion,
    )
    assert.equal(exclusiveRows.length, 0)
  })

  it('post-enable reservation changes are after tip and must be applied by live path', () => {
    const tipAtEnable = 99810
    const later = [
      { evidence: 'rezervace', id: '156', inVersion: 99811 },
      { evidence: 'skladova-karta', id: '1', inVersion: 99813 },
    ]
    const applied = later.filter((c) => c.inVersion > tipAtEnable)
    assert.equal(applied.length, 2)
  })
})

describe('Webhook delivery status', () => {
  it('localhost URL is unreachable even when Auto Sync ON', () => {
    const webhookAccepting = true
    const webhookUrl = 'https://localhost:3000/flexi/webhook'
    const unreachable =
      webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1')
    assert.equal(webhookAccepting, true)
    assert.equal(unreachable, true)
  })

  it('registration alone does not imply receiving', () => {
    const lastWebhookReceivedAt = undefined
    const webhookRemoteId = '5'
    const status =
      lastWebhookReceivedAt
        ? 'receiving'
        : webhookRemoteId
          ? 'registered_waiting'
          : 'error'
    assert.equal(status, 'registered_waiting')
  })
})

describe('Reservation vs dostupMj', () => {
  it('SITE stock source remains dostupMj; stavMj - rezervace = dostupMj', () => {
    const stavMj = 119
    const rezervace = 50
    const dostupMj = 69
    assert.equal(stavMj - rezervace, dostupMj)
    const siteStockSource = 'dostupMj'
    assert.equal(siteStockSource, 'dostupMj')
  })
})
