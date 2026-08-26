import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  flexiApiCallsForUtcDay,
  isFlexiMissingRecordError,
  isCatalogFlexiEvidence,
  isImplementedFlexiEvidence,
  isUnsupportedSkippableFlexiEvidence,
} from './flexi.constants'

describe('flexi evidence helpers', () => {
  it('isImplementedFlexiEvidence matches audit appendix', () => {
    assert.equal(isImplementedFlexiEvidence('cenik'), true)
    assert.equal(isImplementedFlexiEvidence('skladova-karta'), true)
    assert.equal(isImplementedFlexiEvidence('strom'), true)
    assert.equal(isImplementedFlexiEvidence('objednavka-prijata'), true)
    assert.equal(isImplementedFlexiEvidence('objednavka-prijata-polozka'), false)
    assert.equal(isImplementedFlexiEvidence('faktura-prijata-polozka'), false)
    assert.equal(isImplementedFlexiEvidence('strom-cenik'), false)
  })

  it('isUnsupportedSkippableFlexiEvidence excludes catalog and implemented', () => {
    assert.equal(isUnsupportedSkippableFlexiEvidence('faktura-prijata-polozka'), true)
    assert.equal(isUnsupportedSkippableFlexiEvidence('cenik'), false)
    assert.equal(isUnsupportedSkippableFlexiEvidence('objednavka-prijata-polozka'), true)
  })

  it('isCatalogFlexiEvidence excludes orders and strom-cenik', () => {
    assert.equal(isCatalogFlexiEvidence('cenik'), true)
    assert.equal(isCatalogFlexiEvidence('strom-cenik'), false)
    assert.equal(isCatalogFlexiEvidence('objednavka-prijata'), false)
  })
})

describe('flexiApiCallsForUtcDay', () => {
  it('returns stored count only for the current UTC date', () => {
    assert.equal(flexiApiCallsForUtcDay(2477, '2026-08-18', '2026-08-18'), 2477)
    assert.equal(flexiApiCallsForUtcDay(2477, '2026-08-18', '2026-08-19'), 0)
    assert.equal(flexiApiCallsForUtcDay(12, '', '2026-08-19'), 0)
  })
})

describe('isFlexiMissingRecordError', () => {
  it('matches Flexi 404 / formZaznamNenalezen', () => {
    assert.equal(
      isFlexiMissingRecordError(
        'Flexi HTTP 404: {"message@messageCode":"formZaznamNenalezen","message":"Záznam nebyl v datovém zdroji nalezen"}',
      ),
      true,
    )
    assert.equal(isFlexiMissingRecordError('Flexi HTTP 500: timeout'), false)
  })
})
