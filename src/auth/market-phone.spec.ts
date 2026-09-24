import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  normalizeIntlPhone,
  normalizePhoneE164,
  normalizePhoneSkE164,
  normalizeStoredPhoneE164,
} from './auth.utils'
import { validatePhoneForPolicy } from './market-phone.util'

describe('phone normalize market-aware', () => {
  it('UA normalizePhoneE164 only invents +380', () => {
    assert.equal(normalizePhoneE164('0501234567'), '+380501234567')
    assert.equal(normalizePhoneSkE164('0901234567'), '+421901234567')
  })

  it('intl rejects bare national 0… without country', () => {
    assert.equal(normalizeIntlPhone('0901234567'), null)
    assert.equal(normalizeIntlPhone('+421901234567'), '+421901234567')
  })

  it('validatePhoneForPolicy intl + sk region → +421 for national', () => {
    assert.equal(validatePhoneForPolicy('0901234567', 'intl', 'sk'), '+421901234567')
    assert.equal(validatePhoneForPolicy('0901234567', 'intl', 'ua'), '+380901234567')
    assert.equal(validatePhoneForPolicy('+420777123456', 'intl', 'sk'), '+420777123456')
  })

  it('normalizeStoredPhoneE164 never rewrites +421 to +380', () => {
    assert.equal(normalizeStoredPhoneE164('+421901234567'), '+421901234567')
    assert.equal(normalizeStoredPhoneE164('+380501234567'), '+380501234567')
  })
})
