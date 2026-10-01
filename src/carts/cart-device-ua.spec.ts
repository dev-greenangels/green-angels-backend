import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  normalizeDeviceClass,
  normalizeDeviceModel,
  parseUserAgentDevice,
} from './cart-device-ua'

describe('cart-device-ua', () => {
  it('empty UA → unknown', () => {
    assert.deepEqual(parseUserAgentDevice(null), {
      deviceClass: 'unknown',
      deviceModel: null,
    })
    assert.deepEqual(parseUserAgentDevice(''), {
      deviceClass: 'unknown',
      deviceModel: null,
    })
  })

  it('iPhone → mobile + iPhone', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    assert.deepEqual(parseUserAgentDevice(ua), {
      deviceClass: 'mobile',
      deviceModel: 'iPhone',
    })
  })

  it('iPad → tablet + iPad', () => {
    const ua =
      'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    assert.deepEqual(parseUserAgentDevice(ua), {
      deviceClass: 'tablet',
      deviceModel: 'iPad',
    })
  })

  it('Android phone extracts model when present', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    const out = parseUserAgentDevice(ua)
    assert.equal(out.deviceClass, 'mobile')
    assert.equal(out.deviceModel, 'Pixel 7')
  })

  it('Android tablet (no Mobile) → tablet', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 12; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    const out = parseUserAgentDevice(ua)
    assert.equal(out.deviceClass, 'tablet')
    assert.equal(out.deviceModel, 'SM-T870')
  })

  it('desktop → desktop, no model', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    assert.deepEqual(parseUserAgentDevice(ua), {
      deviceClass: 'desktop',
      deviceModel: null,
    })
  })

  it('normalizes class / model helpers', () => {
    assert.equal(normalizeDeviceClass('Mobile'), 'mobile')
    assert.equal(normalizeDeviceClass('laptop'), null)
    assert.equal(normalizeDeviceModel('  Pixel 7  '), 'Pixel 7')
    assert.equal(normalizeDeviceModel(''), null)
  })
})
