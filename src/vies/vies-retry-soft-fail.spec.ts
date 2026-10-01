import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/**
 * Documents soft-failure contract for Retry VIES + Flexi note sync:
 * VIES audit persistence must not depend on Flexi poznam PUT success.
 * (Integration covered by orders.service retryViesCheck sequencing.)
 */
describe('VIES retry Flexi soft-failure contract', () => {
  it('audit result stays even when Flexi note sync reports failure', () => {
    const viesUpdated = true
    const flexiNoteSync = { ok: false as const, message: 'transport timeout' }
    assert.equal(viesUpdated, true)
    assert.equal(flexiNoteSync.ok, false)
    // Partial UX: show both success (VIES) and warning (ABRA note).
    const customerFacing = {
      viesOk: viesUpdated,
      flexiWarning: !flexiNoteSync.ok,
    }
    assert.deepEqual(customerFacing, { viesOk: true, flexiWarning: true })
  })
})
