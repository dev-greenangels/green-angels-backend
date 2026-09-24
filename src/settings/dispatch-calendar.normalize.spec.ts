import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  normalizeShippingLeadNotice,
  resolveShippingLeadNoticeText,
  shouldShowShippingLeadNotice,
} from './dispatch-calendar.normalize'

describe('shippingLeadNotice', () => {
  it('normalizes defaults and locales', () => {
    const notice = normalizeShippingLeadNotice({ enabled: true, showMode: 'always', texts: { uk: '  UA  ' } })
    assert.equal(notice.enabled, true)
    assert.equal(notice.showMode, 'always')
    assert.equal(notice.texts.uk, 'UA')
    assert.ok(notice.texts.en.length > 0)
    assert.ok(notice.texts.sk.length > 0)
  })

  it('showMode gates visibility', () => {
    const notice = normalizeShippingLeadNotice({ enabled: true, showMode: 'when_calendar_off' })
    assert.equal(shouldShowShippingLeadNotice(notice, false), true)
    assert.equal(shouldShowShippingLeadNotice(notice, true), false)
    const always = normalizeShippingLeadNotice({ enabled: true, showMode: 'always' })
    assert.equal(shouldShowShippingLeadNotice(always, true), true)
    assert.equal(shouldShowShippingLeadNotice(always, false), true)
  })

  it('resolves locale with uk/en fallback', () => {
    const notice = normalizeShippingLeadNotice({
      enabled: true,
      texts: { uk: 'Українською', en: 'English', cs: '' },
    })
    // Empty cs is replaced by default CS copy during normalize.
    assert.ok(notice.texts.cs.length > 0)
    assert.equal(
      resolveShippingLeadNoticeText(
        { enabled: true, showMode: 'always', texts: { uk: 'Українською' } },
        'xx',
      ),
      'Українською',
    )
  })
})
