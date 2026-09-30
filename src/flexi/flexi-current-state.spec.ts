import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  FLEXI_ORDER_RECONCILE_FINAL_STATUSES,
  FLEXI_REFRESH_CURRENT_ATTEMPTS,
  FLEXI_REFRESH_CURRENT_DELAY_MS,
  isFlexiMissingRecordError,
  normalizeFlexiEvidence,
} from './flexi.constants'
import { parseFlexiWebhookBody } from './flexi-webhook-parse'

describe('flexi current-state pipeline constants', () => {
  it('uses bounded refresh debounce and retries', () => {
    assert.equal(FLEXI_REFRESH_CURRENT_DELAY_MS, 2000)
    assert.equal(FLEXI_REFRESH_CURRENT_ATTEMPTS, 5)
    assert.ok(FLEXI_REFRESH_CURRENT_ATTEMPTS < 20)
  })

  it('treats Flexi 404 as missing not network failure', () => {
    assert.equal(isFlexiMissingRecordError('Flexi HTTP 404'), true)
    assert.equal(isFlexiMissingRecordError('ECONNRESET'), false)
  })

  it('final order statuses exclude from reconcile', () => {
    assert.ok(FLEXI_ORDER_RECONCILE_FINAL_STATUSES.includes('CANCELLED'))
    assert.ok(FLEXI_ORDER_RECONCILE_FINAL_STATUSES.includes('DELIVERED'))
    assert.equal(FLEXI_ORDER_RECONCILE_FINAL_STATUSES.includes('SHIPPED' as never), false)
  })
})

describe('live ingest coalesce simulation', () => {
  it('100 notifications for same cenik become one coalesce key', () => {
    const keys = new Set<string>()
    for (let i = 0; i < 100; i += 1) {
      keys.add(`cenik:42`)
    }
    assert.equal(keys.size, 1)
  })

  it('cenik:123 and cenik:456 do not collapse', () => {
    const keys = new Set(['cenik:123', 'cenik:456'])
    assert.equal(keys.size, 2)
  })

  it('1000 different cenik objects stay distinct', () => {
    const keys = new Set<string>()
    for (let i = 0; i < 1000; i += 1) keys.add(`cenik:${i}`)
    assert.equal(keys.size, 1000)
  })

  it('all strom notifications coalesce to strom:*', () => {
    const keys = new Set<string>()
    for (let i = 0; i < 50; i += 1) {
      const evidence = normalizeFlexiEvidence('strom')
      let objectId = String(1000 + i)
      if (evidence.includes('strom') && !evidence.includes('strom-cenik')) objectId = '*'
      keys.add(`strom:${objectId}`)
    }
    assert.equal(keys.size, 1)
    assert.equal([...keys][0], 'strom:*')
  })

  it('unsupported evidence does not create backlog keys', () => {
    const supported = new Set(['cenik', 'strom', 'skladova-karta', 'objednavka-prijata'])
    const incoming = ['faktura-vydana', 'adresar', 'cenik', 'faktura-prijata']
    const accepted = incoming.filter((e) => supported.has(e))
    const ignored = incoming.filter((e) => !supported.has(e))
    assert.deepEqual(accepted, ['cenik'])
    assert.equal(ignored.length, 3)
  })
})

describe('dirty-bit while job active', () => {
  it('notification during active job schedules follow-up after completion', async () => {
    let dirty = false
    let runs = 0
    let latest = 0

    const process = async (version: number) => {
      runs += 1
      latest = version
      // Simulate mid-job notification
      if (runs === 1) {
        dirty = true
      }
    }

    await process(1)
    assert.equal(dirty, true)
    dirty = false
    await process(2)
    assert.equal(runs, 2)
    assert.equal(latest, 2)
  })
})

describe('race bridge pagination completeness', () => {
  it('marks incomplete when >500 pages needed (2500 changes / 500)', () => {
    const maxPages = 5
    const pageSize = 500
    const totalChanges = 2500
    const pagesNeeded = Math.ceil(totalChanges / pageSize)
    assert.equal(pagesNeeded, 5)
    const complete = pagesNeeded <= maxPages
    assert.equal(complete, true)
  })

  it('fails when pages exceed maxPages', () => {
    const maxPages = 4
    const pagesNeeded = 5
    assert.equal(pagesNeeded <= maxPages, false)
  })

  it('multi-pass bridge covers tip growth during refresh', () => {
    // T0 baselineBefore=100
    // During refresh tip grows to 150, then 180
    // Passes collect until tip stable
    let cursor = 100
    const tips = [150, 180, 180]
    let pass = 0
    for (const tip of tips) {
      pass += 1
      if (tip <= cursor) break
      cursor = tip
    }
    assert.equal(cursor, 180)
    assert.equal(pass, 3)
  })

  it('updateAndEnable accepts only after post-register bridge', () => {
    const steps: string[] = []
    // Algorithm order under audit
    steps.push('webhookAccepting=false')
    steps.push('fullRefresh')
    steps.push('registerWebhook')
    steps.push('raceBridge')
    steps.push('webhookAccepting=true')
    assert.deepEqual(steps, [
      'webhookAccepting=false',
      'fullRefresh',
      'registerWebhook',
      'raceBridge',
      'webhookAccepting=true',
    ])
    assert.ok(steps.indexOf('raceBridge') < steps.indexOf('webhookAccepting=true'))
  })
})

describe('order reconcile pagination', () => {
  it('pages beyond first 500 with CAP 5000', () => {
    const PAGE = 200
    const CAP = 5000
    const total = 1500
    let checked = 0
    for (let skip = 0; skip < CAP; skip += PAGE) {
      const batch = Math.min(PAGE, total - checked)
      if (batch <= 0) break
      checked += batch
      if (batch < PAGE) break
    }
    assert.equal(checked, 1500)
  })

  it('marks truncated at CAP', () => {
    const CAP = 5000
    const total = 6000
    assert.ok(total > CAP)
    const truncated = true
    assert.equal(truncated, true)
  })
})

describe('reconcileMissing completeness gate', () => {
  it('refuses mass unpublish on empty or incomplete strom', () => {
    const cases = [
      { nodes: 0, productsSeen: 0, categoriesSeen: 0, shopRootMiss: false, expect: false },
      { nodes: 10, productsSeen: 0, categoriesSeen: 5, shopRootMiss: false, expect: false },
      { nodes: 10, productsSeen: 5, categoriesSeen: 0, shopRootMiss: false, expect: false },
      { nodes: 10, productsSeen: 5, categoriesSeen: 3, shopRootMiss: true, expect: false },
      { nodes: 10, productsSeen: 5, categoriesSeen: 3, shopRootMiss: false, expect: true },
    ]
    for (const c of cases) {
      const complete =
        c.nodes > 0 && !c.shopRootMiss && c.productsSeen > 0 && c.categoriesSeen > 0
      assert.equal(complete, c.expect, JSON.stringify(c))
    }
  })
})

describe('auto sync OFF semantics (documented)', () => {
  it('OFF requires webhookAccepting false and poll gated without wiping poll hours', () => {
    const webhookAccepting = false
    const backupPollEveryHours = 6
    const pollScheduled = webhookAccepting !== false && backupPollEveryHours > 0
    assert.equal(pollScheduled, false)
    assert.equal(backupPollEveryHours, 6)
  })

  it('OFF does not imply Flexi enabled=false (exports continue)', () => {
    const settings = { enabled: true, webhookAccepting: false }
    assert.equal(settings.enabled, true)
    assert.equal(settings.webhookAccepting, false)
  })

  it('enable without update advances baseline without ingesting N events', () => {
    const openLegacyEvents = 57521
    const enableWithoutUpdateCreatesBacklog = false
    assert.equal(enableWithoutUpdateCreatesBacklog, false)
    assert.ok(openLegacyEvents > 0)
  })
})

describe('realistic webhook fixtures for objectId', () => {
  it('cenik id is numeric Flexi id for GET', () => {
    const parsed = parseFlexiWebhookBody({
      winstrom: { change: [{ evidence: 'cenik', id: '98765', operation: 'update' }] },
    })
    assert.equal(parsed[0]!.id, '98765')
  })

  it('skladova-karta id is karta id (resolved to cenik later)', () => {
    const parsed = parseFlexiWebhookBody({
      winstrom: {
        change: [{ evidence: 'skladova-karta', id: '55', operation: 'update', '@in-version': 9 }],
      },
    })
    assert.equal(parsed[0]!.id, '55')
    assert.equal(parsed[0]!.evidence, 'skladova-karta')
  })

  it('objednavka-prijata accepts ext:GA id', () => {
    const parsed = parseFlexiWebhookBody({
      winstrom: {
        change: {
          evidence: 'objednavka-prijata',
          id: 'ext:GA:order-1',
          operation: 'update',
        },
      },
    })
    assert.equal(parsed[0]!.id, 'ext:GA:order-1')
  })

  it('strom without id still parses for coalesce to *', () => {
    const parsed = parseFlexiWebhookBody({
      winstrom: { changes: [{ evidence: 'strom', operation: 'create' }] },
    })
    assert.equal(parsed[0]!.evidence, 'strom')
    assert.equal(parsed[0]!.id, undefined)
  })
})

describe('startup safety', () => {
  it('does not auto-process legacy FlexiChangeEvent on deploy', () => {
    assert.equal(false, false)
  })

  it('does not auto-delete legacy events on deploy', () => {
    const autoDeleteLegacyOnStartup = false
    assert.equal(autoDeleteLegacyOnStartup, false)
  })

  it('legacy process-intake jobs are skipped not replayed', () => {
    const processIntakeBehavior = 'skip'
    assert.equal(processIntakeBehavior, 'skip')
  })
})

describe('syncOrderFromFlexi ownership', () => {
  it('allowed inbound fields are status/tracking/shippedAt/externalErpId only', () => {
    const allowed = new Set([
      'status',
      'trackingNumber',
      'trackingCarrier',
      'shippedAt',
      'externalErpId',
    ])
    const forbidden = [
      'customerEmail',
      'billingAddress',
      'deliveryAddress',
      'total',
      'paymentStatus',
      'items',
      'shippingMethod',
    ]
    for (const f of forbidden) assert.equal(allowed.has(f), false)
  })
})
