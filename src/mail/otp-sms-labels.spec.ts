import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getOtpSmsText, resolveOtpSmsLocale } from './otp-sms-labels'

describe('otp-sms-labels', () => {
  it('resolves known locales and falls back to en', () => {
    assert.equal(resolveOtpSmsLocale('hu'), 'hu')
    assert.equal(resolveOtpSmsLocale('CS'), 'cs')
    assert.equal(resolveOtpSmsLocale(null), 'en')
    assert.equal(resolveOtpSmsLocale('xx'), 'en')
  })

  it('builds locale-specific SMS bodies with the code', () => {
    assert.match(getOtpSmsText('uk', '123456'), /123456/)
    assert.match(getOtpSmsText('uk', '123456'), /Зелені Янголи/)
    assert.match(getOtpSmsText('sk', '123456'), /Kód Green Angels/)
    assert.match(getOtpSmsText('cs', '123456'), /Kód Green Angels/)
    assert.match(getOtpSmsText('hu', '123456'), /Green Angels kód/)
    assert.match(getOtpSmsText('de', '123456'), /Green-Angels-Code/)
    assert.match(getOtpSmsText('en', '123456'), /Green Angels code/)
    assert.doesNotMatch(getOtpSmsText('hu', '123456'), /[А-Яа-яЁёІіЇїЄє]/)
  })
})
