import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  classifyFlexiError,
  erpSyncErrorCodeForKind,
} from './erp-sync.errors'

describe('classifyFlexiError', () => {
  it('matches Flexi HTTP 400 case-insensitively as business', () => {
    assert.equal(
      classifyFlexiError(
        'Flexi HTTP 400: {"message":"Záznam nebyl v datovém zdroji nalezen"}',
      ),
      'business',
    )
    assert.equal(
      erpSyncErrorCodeForKind(
        classifyFlexiError('Flexi HTTP 400: something'),
      ),
      'REJECTED_STOCK',
    )
  })

  it('classifies sazbaDphNotFound* as VAT_CONFIGURATION (not TRANSPORT)', () => {
    const message =
      'Flexi HTTP 400: {"errors":[{"message":"Pro danou hodnotu sazby [23.0], datum [11.09.2026] a stát [Rakúsko] neexistuje platná sazba DPH.","messageCode":"sazbaDphNotFoundDateValueState"}]}'
    assert.equal(classifyFlexiError(message), 'vat_configuration')
    assert.equal(erpSyncErrorCodeForKind('vat_configuration'), 'VAT_CONFIGURATION')
  })

  it('classifies sazbaDphNotFound without HTTP prefix', () => {
    assert.equal(
      classifyFlexiError('sazbaDphNotFoundDateValueState'),
      'vat_configuration',
    )
  })
})
