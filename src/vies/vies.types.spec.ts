import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  formatEuVatId,
  isCacheableViesResult,
  isPersistableViesAudit,
  normalizeEuVatNumberPart,
  normalizeViesCountryCode,
  resolveViesStatus,
  viesVatIdentityKey,
  type ViesValidationResult,
} from './vies.types'

describe('vies.types identity + status', () => {
  it('normalizes PL/AT/CZ/SK/EL/GR identity consistently', () => {
    assert.equal(viesVatIdentityKey('PL', '1234567890'), 'PL:1234567890')
    assert.equal(viesVatIdentityKey('pl', 'PL 1234-567890'), 'PL:1234567890')
    assert.equal(viesVatIdentityKey('AT', 'U12345678'), 'AT:U12345678')
    assert.equal(viesVatIdentityKey('CZ', '12345678'), 'CZ:12345678')
    assert.equal(viesVatIdentityKey('SK', '2120123456'), 'SK:2120123456')
    assert.equal(viesVatIdentityKey('EL', '123456789'), 'EL:123456789')
    assert.equal(viesVatIdentityKey('GR', '123456789'), 'EL:123456789')
    assert.equal(normalizeViesCountryCode('GR'), 'EL')
    assert.equal(formatEuVatId('PL', 'PL1234567890'), 'PL1234567890')
    assert.equal(formatEuVatId('GR', '123456789'), 'EL123456789')
    assert.equal(normalizeEuVatNumberPart('PL', 'PL123'), '123')
  })

  it('resolveViesStatus covers VALID/INVALID/ERROR/NOT_CHECKED', () => {
    assert.equal(resolveViesStatus({ companyVatId: null, viesCheck: null }), 'NOT_CHECKED')
    assert.equal(
      resolveViesStatus({ companyVatId: '123', viesCheck: null }),
      'NOT_CHECKED',
    )
    assert.equal(
      resolveViesStatus({ viesCheck: { valid: true, source: 'vies_rest' } }),
      'VALID',
    )
    assert.equal(
      resolveViesStatus({ viesCheck: { valid: false, source: 'vies_rest' } }),
      'INVALID',
    )
    assert.equal(
      resolveViesStatus({ viesCheck: { valid: null, source: 'unavailable' } }),
      'ERROR',
    )
  })

  it('technical failures are not cacheable as successful validations', () => {
    assert.equal(isCacheableViesResult({ valid: true }), true)
    assert.equal(isCacheableViesResult({ valid: false }), true)
    assert.equal(isCacheableViesResult({ valid: null }), false)
  })

  it('format reject is not persistable as VIES audit', () => {
    const formatResult: ViesValidationResult = {
      valid: null,
      countryCode: '',
      vatNumber: '',
      message: 'bad format',
      source: 'format',
    }
    assert.equal(isPersistableViesAudit(formatResult), false)
    assert.equal(
      isPersistableViesAudit({
        ...formatResult,
        valid: null,
        source: 'unavailable',
        countryCode: 'PL',
        vatNumber: '123',
      }),
      true,
    )
  })
})
