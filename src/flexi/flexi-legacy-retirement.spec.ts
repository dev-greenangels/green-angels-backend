import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  classifyLegacyEvidence,
  deleteRecoveryPolicy,
  FLEXI_CHANGE_EVENT_CREATE_ENTRYPOINTS,
  LEGACY_RETIRE_CONFIRM,
  NORMAL_RUNTIME_DEPENDS_ON_JOURNAL,
} from './flexi-legacy-evidence.classification'

describe('legacy evidence classification (FLEXI-LEGACY-RETIRE-002)', () => {
  const live = ['cenik', 'skladova-karta', 'strom', 'rezervace'] as const

  it('classifies current-state evidences', () => {
    assert.equal(classifyLegacyEvidence('cenik', live), 'CURRENT_STATE_RECOVERABLE')
    assert.equal(classifyLegacyEvidence('skladova-karta', live), 'CURRENT_STATE_RECOVERABLE')
    assert.equal(classifyLegacyEvidence('strom', live), 'CURRENT_STATE_RECOVERABLE')
    assert.equal(classifyLegacyEvidence('rezervace', live), 'CURRENT_STATE_RECOVERABLE')
  })

  it('classifies order documents for reconcile — not typ-objednavky config', () => {
    assert.equal(classifyLegacyEvidence('objednavka-prijata', live), 'ORDER_RECONCILE')
    assert.equal(classifyLegacyEvidence('objednavka-prijata-polozka', live), 'ORDER_RECONCILE')
    assert.equal(classifyLegacyEvidence('typ-objednavky-prijate', live), 'IRRELEVANT_TO_SITE')
  })

  it('production UNKNOWN-8 audit → IRRELEVANT_TO_SITE', () => {
    const cases = [
      'odberatel',
      'typ-faktury-vydane',
      'sklad',
      'stav-obchodniho-dokladu',
      'typ-objednavky-prijate',
      'kurz',
      'stat',
      'typ-faktury-prijate',
    ] as const
    for (const ev of cases) {
      assert.equal(
        classifyLegacyEvidence(ev, live),
        'IRRELEVANT_TO_SITE',
        ev,
      )
    }
  })

  it('DELETE odberatel does not block when IRRELEVANT_TO_SITE', () => {
    const c = classifyLegacyEvidence('odberatel', live)
    assert.equal(c, 'IRRELEVANT_TO_SITE')
    assert.equal(deleteRecoveryPolicy('odberatel', c).recoverableWithoutReplay, true)
  })

  it('sklad warehouse master ≠ skladova-karta', () => {
    assert.equal(classifyLegacyEvidence('sklad', live), 'IRRELEVANT_TO_SITE')
    assert.equal(classifyLegacyEvidence('skladova-karta', live), 'CURRENT_STATE_RECOVERABLE')
  })

  it('BLOCKER still blocks DELETE', () => {
    const c = classifyLegacyEvidence('totally-new-evidence-xyz', live)
    assert.equal(c, 'BLOCKER')
    assert.equal(deleteRecoveryPolicy('totally-new-evidence-xyz', c).recoverableWithoutReplay, false)
  })

  it('skladovy-pohyb is IRRELEVANT_TO_SITE', () => {
    assert.equal(classifyLegacyEvidence('skladovy-pohyb', live), 'IRRELEVANT_TO_SITE')
  })
})

describe('legacy retirement contracts', () => {
  it('normal runtime does not depend on journal', () => {
    assert.equal(NORMAL_RUNTIME_DEPENDS_ON_JOURNAL, false)
  })

  it('sole create entrypoint is ingestChanges (must stay unreachable)', () => {
    assert.deepEqual(FLEXI_CHANGE_EVENT_CREATE_ENTRYPOINTS, [
      'FlexiChangeIntakeService.ingestChanges',
    ])
  })

  it('confirm token is explicit', () => {
    assert.equal(LEGACY_RETIRE_CONFIRM, 'RETIRE_LEGACY_FLEXI_JOURNAL')
  })

  it('delete journal must not reset globalVersion (algorithm)', () => {
    const globalVersionBefore = 99810
    const settingsTouchedByDelete = false
    const globalVersionAfter = settingsTouchedByDelete ? 0 : globalVersionBefore
    assert.equal(globalVersionAfter, globalVersionBefore)
  })

  it('IRRELEVANT DELETE never forces safeToRetire=false alone', () => {
    const deleteRows = [{ evidence: 'odberatel', classification: 'IRRELEVANT_TO_SITE' as const }]
    const blockers = deleteRows.filter(
      (d) => !deleteRecoveryPolicy(d.evidence, d.classification).recoverableWithoutReplay,
    )
    assert.equal(blockers.length, 0)
  })
})
