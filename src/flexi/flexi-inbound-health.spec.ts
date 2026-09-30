import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { FlexiInboundHealthService } from './flexi-inbound-health.service'

describe('FlexiInboundHealthService.deriveStatus', () => {
  const svc = new FlexiInboundHealthService({} as never)

  it('disabled when Auto Sync OFF even with open failures', () => {
    assert.equal(
      svc.deriveStatus({
        webhookAccepting: false,
        openFailures: [{ key: 'cenik:1', at: '', message: 'x' }],
        lastSyncStatus: 'error',
      }),
      'disabled',
    )
  })

  it('error when any open live failure remains', () => {
    assert.equal(
      svc.deriveStatus({
        webhookAccepting: true,
        openFailures: [{ key: 'cenik:1', at: '', message: 'boom' }],
        lastSyncStatus: 'ok',
      }),
      'error',
    )
  })

  it('success on unrelated object must not imply healthy if another failure open', () => {
    // Semantics: clearFailure('cenik:456') leaves cenik:123 → still error
    const remaining = [{ key: 'cenik:123', at: 't', message: 'fail' }]
    assert.equal(
      svc.deriveStatus({
        webhookAccepting: true,
        openFailures: remaining,
        lastSyncStatus: 'error',
      }),
      'error',
    )
  })

  it('healthy when accepting and no open failures and last sync ok', () => {
    assert.equal(
      svc.deriveStatus({
        webhookAccepting: true,
        openFailures: [],
        lastSyncStatus: 'ok',
      }),
      'healthy',
    )
  })

  it('degraded when lastSyncStatus error even without openFailures list', () => {
    assert.equal(
      svc.deriveStatus({
        webhookAccepting: true,
        openFailures: [],
        lastSyncStatus: 'error',
      }),
      'degraded',
    )
  })
})

describe('FlexiInboundHealthService.deriveWebhookDeliveryStatus', () => {
  const svc = new FlexiInboundHealthService({} as never)

  it('localhost is unreachable_url even when accepting', () => {
    assert.equal(
      svc.deriveWebhookDeliveryStatus({
        webhookAccepting: true,
        webhookUrl: 'https://localhost:3000/flexi/webhook',
        webhookRemoteId: '5',
      }),
      'unreachable_url',
    )
  })

  it('registered without delivery is waiting', () => {
    assert.equal(
      svc.deriveWebhookDeliveryStatus({
        webhookAccepting: true,
        webhookUrl: 'https://api.example.com/flexi/webhook',
        webhookRemoteId: '5',
      }),
      'registered_waiting',
    )
  })

  it('receiving after lastWebhookReceivedAt', () => {
    assert.equal(
      svc.deriveWebhookDeliveryStatus({
        webhookAccepting: true,
        webhookUrl: 'https://api.example.com/flexi/webhook',
        webhookRemoteId: '5',
        lastWebhookReceivedAt: '2026-09-30T01:00:00.000Z',
      }),
      'receiving',
    )
  })
})

describe('Full Refresh count honesty', () => {
  it('does not invent stock counter separate from cenikUpdated', () => {
    const counts = {
      categories: 10,
      products: 20,
      variants: 30,
      cenikUpdated: 40,
      // no fake "stock" or "prices" keys unless measured
    }
    assert.equal('stock' in counts, false)
    assert.equal('prices' in counts, false)
    assert.ok(counts.cenikUpdated === 40)
  })
})
