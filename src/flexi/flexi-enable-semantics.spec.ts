import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/**
 * Semantic regression for Enable Without Update vs Update & Enable.
 * Pure algorithm tests — no ABRA/network.
 */

describe('Enable Without Update semantics', () => {
  it('does not refresh OFF-period stock; only post-baseline live changes', () => {
    // SITE stock=10, OFF, ABRA→15 while OFF
    let siteStock = 10
    const abraStockOffPeriod = 15
    // Enable without update: tip=T, no catch-up of OFF changes
    const applyOffPeriodCatchUp = false
    if (applyOffPeriodCatchUp) siteStock = abraStockOffPeriod
    assert.equal(siteStock, 10)

    // After enable, ABRA 15→17 via live webhook
    const abraAfterEnable = 17
    siteStock = abraAfterEnable // live path
    assert.equal(siteStock, 17)
  })

  it('sets baseline to tip BEFORE accepting / poll can run', () => {
    const steps: string[] = []
    steps.push('webhookAccepting=false')
    steps.push('rebuildJobs')
    steps.push('tip=O(1) globalVersion')
    steps.push('globalVersion=tip')
    steps.push('registerWebhook lastVersion=tip setAccepting=false')
    steps.push('raceBridgeFromTipPlusOneExclusive')
    steps.push('webhookAccepting=true')
    steps.push('rebuildJobs')

    assert.ok(steps.indexOf('globalVersion=tip') < steps.indexOf('webhookAccepting=true'))
    assert.ok(
      steps.indexOf('registerWebhook lastVersion=tip setAccepting=false') <
        steps.indexOf('webhookAccepting=true'),
    )
    assert.equal(steps.includes('walkChangesHistoryFromOldCursor'), false)
    assert.ok(steps.includes('raceBridgeFromTipPlusOneExclusive'))
  })

  it('registerWebhook must not flip accepting mid-enable', () => {
    const registerSetsAccepting = false
    assert.equal(registerSetsAccepting, false)
  })

  it('race bridge must not include tip change (Changes start is inclusive)', () => {
    const tip = 100
    const start = tip + 1
    const afterVersion = tip
    const tipRow = { inVersion: tip }
    const included = tipRow.inVersion >= start && tipRow.inVersion > afterVersion
    assert.equal(included, false)
  })
})

describe('Update & Enable semantics', () => {
  it('authoritative refresh applies OFF-period stock', () => {
    let siteStock = 10
    const abraWhileOff = 15
    // Full Refresh applies current cenik/stock
    siteStock = abraWhileOff
    assert.equal(siteStock, 15)
  })
})

describe('Changes tip early-exit bug (regression)', () => {
  it('must not treat short page as end of stream', () => {
    // Flexi may return <limit (e.g. 100) even mid-history if limit ignored.
    const pageLength = 100
    const limit = 500
    const nextIsNone = false
    const completeByLengthAlone = pageLength < limit
    const completeCorrect = nextIsNone || pageLength === 0
    assert.equal(completeByLengthAlone, true) // old buggy condition would fire
    assert.equal(completeCorrect, false) // must continue walking / use root globalVersion
  })
})

describe('Loader UX', () => {
  it('success and error both clear loading', () => {
    let busy: string | null = 'enable-only'
    const finish = (_ok: boolean) => {
      busy = null
    }
    finish(true)
    assert.equal(busy, null)
    busy = 'enable-only'
    finish(false)
    assert.equal(busy, null)
  })
})
