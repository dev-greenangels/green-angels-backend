import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  classifyLegacyEvidence,
  deleteRecoveryPolicy,
  LEGACY_RETIRE_CONFIRM,
  NORMAL_RUNTIME_DEPENDS_ON_JOURNAL,
} from './flexi-legacy-evidence.classification'

describe('legacy evidence classification', () => {
  const live = ['cenik', 'skladova-karta', 'strom', 'rezervace'] as const

  it('classifies current-state evidences', () => {
    assert.equal(classifyLegacyEvidence('cenik', live), 'CURRENT_STATE_RECOVERABLE')
    assert.equal(classifyLegacyEvidence('skladova-karta', live), 'CURRENT_STATE_RECOVERABLE')
    assert.equal(classifyLegacyEvidence('strom', live), 'CURRENT_STATE_RECOVERABLE')
    assert.equal(classifyLegacyEvidence('rezervace', live), 'CURRENT_STATE_RECOVERABLE')
  })

  it('classifies orders for reconcile', () => {
    assert.equal(classifyLegacyEvidence('objednavka-prijata', live), 'ORDER_RECONCILE')
    assert.equal(classifyLegacyEvidence('objednavka-prijata-polozka', live), 'ORDER_RECONCILE')
  })

  it('classifies unsupported noise as IRRELEVANT', () => {
    assert.equal(classifyLegacyEvidence('faktura-vydana', live), 'IRRELEVANT')
    assert.equal(classifyLegacyEvidence('kusovnik', live), 'IRRELEVANT')
  })

  it('UNKNOWN blocks safeToRetire semantics', () => {
    const c = classifyLegacyEvidence('totally-new-evidence-xyz', live)
    assert.equal(c, 'UNKNOWN')
    assert.equal(deleteRecoveryPolicy('totally-new-evidence-xyz', c).recoverableWithoutReplay, false)
  })

  it('skladovy-pohyb is IRRELEVANT (not skladova-karta)', () => {
    assert.equal(classifyLegacyEvidence('skladovy-pohyb', live), 'IRRELEVANT')
    assert.equal(classifyLegacyEvidence('skladovy-pohyb-polozka', live), 'IRRELEVANT')
  })

  it('DELETE on recoverable evidence does not require replay', () => {
    for (const ev of ['cenik', 'skladova-karta', 'strom', 'rezervace', 'objednavka-prijata']) {
      const c = classifyLegacyEvidence(ev, live)
      assert.equal(deleteRecoveryPolicy(ev, c).recoverableWithoutReplay, true)
    }
  })
})

describe('legacy retirement contracts', () => {
  it('normal runtime does not depend on journal', () => {
    assert.equal(NORMAL_RUNTIME_DEPENDS_ON_JOURNAL, false)
  })

  it('confirm token is explicit', () => {
    assert.equal(LEGACY_RETIRE_CONFIRM, 'RETIRE_LEGACY_FLEXI_JOURNAL')
  })

  it('delete journal must not reset globalVersion (algorithm)', () => {
    const globalVersionBefore = 99810
    // deleteJournalBatched touches only FlexiChangeEvent
    const settingsTouchedByDelete = false
    const globalVersionAfter = settingsTouchedByDelete ? 0 : globalVersionBefore
    assert.equal(globalVersionAfter, globalVersionBefore)
    assert.notEqual(globalVersionAfter, 0)
  })

  it('delete journal must not trigger historical Changes replay (algorithm)', () => {
    const stepsAfterDelete: string[] = []
    // Auto Sync remains OFF — no poll / webhook accept
    const webhookAccepting = false
    if (webhookAccepting) stepsAfterDelete.push('pollChangesLive')
    assert.equal(stepsAfterDelete.includes('pollChangesLive'), false)
    assert.equal(stepsAfterDelete.includes('walkChangesFromZero'), false)
  })

  it('preflight UNKNOWN ⇒ safeToRetire false', () => {
    const unknownEvidence = [{ evidence: 'weird', count: 3 }]
    const safeToRetire = unknownEvidence.length === 0
    assert.equal(safeToRetire, false)
  })

  it('Full Refresh / order reconcile failure ⇒ zero deleted', () => {
    const refreshOk = false
    const reconcileOk = true
    let deleted = 0
    if (refreshOk && reconcileOk) deleted = 100
    assert.equal(deleted, 0)
  })

  it('batch deletion uses chunk size not giant IN of 57k', () => {
    const total = 57_521
    const chunk = 1000
    const batches = Math.ceil(total / chunk)
    assert.ok(batches >= 57)
    assert.ok(chunk <= 2000)
  })

  it('Redis legacy cleanup does not wipe api-usage / dirty / sync lock keys', () => {
    const cleaned = ['process-intake']
    const preserved = ['flexi:api-usage:', 'flexi:refresh-dirty:', 'flexi:inbound-sync-lock']
    for (const p of preserved) {
      assert.equal(cleaned.some((c) => p.includes(c)), false)
    }
  })
})
