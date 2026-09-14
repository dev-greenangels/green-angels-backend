import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  getCheckoutPaymentRuleError,
  isPayOnPickupAvailable,
  isPayOnPickupPaymentMethod,
} from './checkout-methods.constants'
import { toPublicCartCheckoutSettings, DEFAULT_CART_CHECKOUT_SETTINGS } from './cart-checkout.types'
import { normalizeCartCheckoutSettings } from './cart-checkout.normalize'
import { mapPaymentMethodToFlexiCode } from '../flexi/flexi-order-export-mapping'

describe('pay-on-pickup settings + validation helpers', () => {
  it('defaults allowPayOnPickup and notify to OFF', () => {
    const normalized = normalizeCartCheckoutSettings({})
    assert.equal(normalized.allowPayOnPickup, false)
    assert.equal(normalized.newOrderNotifyEmailEnabled, false)
    assert.equal(normalized.newOrderNotifyEmail, '')
  })

  it('strips notify email from public cart settings', () => {
    const publicCart = toPublicCartCheckoutSettings({
      ...DEFAULT_CART_CHECKOUT_SETTINGS,
      allowPayOnPickup: true,
      newOrderNotifyEmailEnabled: true,
      newOrderNotifyEmail: 'manager@example.com',
    })
    assert.equal(publicCart.allowPayOnPickup, true)
    assert.equal(publicCart.newOrderNotifyEmailEnabled, false)
    assert.equal(publicCart.newOrderNotifyEmail, '')
  })

  it('isPayOnPickupAvailable requires setting + pickup', () => {
    assert.equal(
      isPayOnPickupAvailable({ allowPayOnPickup: true, deliveryMethod: 'pickup' }),
      true,
    )
    assert.equal(
      isPayOnPickupAvailable({ allowPayOnPickup: true, deliveryMethod: 'gls-courier' }),
      false,
    )
    assert.equal(
      isPayOnPickupAvailable({ allowPayOnPickup: false, deliveryMethod: 'pickup' }),
      false,
    )
  })

  it('4. rejects pickup + dobierka', () => {
    const err = getCheckoutPaymentRuleError({
      paymentMethod: 'dobierka',
      deliveryMethod: 'pickup',
      allowPayOnPickup: true,
    })
    assert.ok(err)
  })

  it('5. rejects courier + pay-on-pickup', () => {
    const err = getCheckoutPaymentRuleError({
      paymentMethod: 'pay-on-pickup',
      deliveryMethod: 'gls-courier',
      allowPayOnPickup: true,
    })
    assert.ok(err)
  })

  it('6. rejects pickup + pay-on-pickup when setting OFF', () => {
    const err = getCheckoutPaymentRuleError({
      paymentMethod: 'pay-on-pickup',
      deliveryMethod: 'pickup',
      allowPayOnPickup: false,
    })
    assert.ok(err)
  })

  it('allows pickup + pay-on-pickup when setting ON', () => {
    assert.equal(
      getCheckoutPaymentRuleError({
        paymentMethod: 'pay-on-pickup',
        deliveryMethod: 'pickup',
        allowPayOnPickup: true,
      }),
      null,
    )
  })

  it('does not map pay-on-pickup to Flexi DOBIERKA', () => {
    assert.equal(isPayOnPickupPaymentMethod('pay-on-pickup'), true)
    assert.equal(mapPaymentMethodToFlexiCode('pay-on-pickup'), undefined)
    assert.equal(mapPaymentMethodToFlexiCode('dobierka'), 'DOBIERKA')
  })
})
