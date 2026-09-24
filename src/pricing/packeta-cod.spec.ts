import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizeCartCheckoutSettings } from '../settings/cart-checkout.normalize'
import {
  resolvePacketaCardOnCodSenderCost,
  resolvePacketaCarrierCodCost,
  resolvePacketaCustomerCodFee,
} from './carrier-config'

describe('Packeta COD normalize + resolve', () => {
  it('legacy flat Packeta COD → customerPrice only (never carrierCost)', () => {
    const normalized = normalizeCartCheckoutSettings({
      carrierConfigs: {
        packeta: {
          cod: {
            enabled: true,
            maxAmount: 700,
            feeBase: 'products_subtotal',
            feeAmountsAreNet: true,
            tiers: [{ fromAmount: 0, toAmount: 100, fee: 1.5 }],
            cardOnCod: {
              noticeEnabled: true,
              referencePercent: 1.2,
              noticeByLocale: { sk: 'dead notice' },
            },
          },
        },
      },
    })
    const cod = normalized.carrierConfigs.packeta!.cod!
    assert.equal(cod.customerPrice.mode, 'tiers')
    assert.equal(cod.customerPrice.tiers[0]?.fee, 1.5)
    assert.equal(cod.customerPrice.maxAmount, 700)
    assert.equal(cod.carrierCost.enabled, false)
    assert.equal(cod.carrierCost.tiers.length, 0)
    assert.equal(cod.cardOnCod.percent, 1.2)
    assert.equal(cod.cardOnCod.enabled, false)
    assert.equal(cod.cardOnCod.affectsCustomerTotal, false)
    assert.equal('noticeEnabled' in (cod.cardOnCod as object), false)
    assert.equal('noticeByLocale' in (cod.cardOnCod as object), false)
  })

  it('legacy cart 1.2% COD is NOT copied into card-on-COD', () => {
    const normalized = normalizeCartCheckoutSettings({
      codFeeMode: 'percent',
      codFeeAmount: 1.2,
      carrierConfigs: {
        packeta: {
          cod: {},
        },
      },
    })
    assert.equal(normalized.codFeeAmount, 1.2)
    assert.equal(normalized.codFeeMode, 'percent')
    assert.equal(normalized.carrierConfigs.packeta!.cod!.cardOnCod.percent, 0)
    assert.equal(normalized.carrierConfigs.packeta!.cod!.cardOnCod.enabled, false)
  })

  it('carrier cost tiers select from COD amount; never returned as customer fee', () => {
    const settings = normalizeCartCheckoutSettings({
      carrierConfigs: {
        packeta: {
          cod: {
            carrierCost: {
              enabled: true,
              basis: 'COD_AMOUNT',
              amountsAreNet: true,
              tiers: [
                { fromAmount: 0, toAmount: 100, fee: 1 },
                { fromAmount: 100, toAmount: null, fee: 2 },
              ],
            },
            customerPrice: { mode: 'none' },
          },
        },
      },
    })
    const cost = resolvePacketaCarrierCodCost(settings, 150)
    assert.equal(cost?.fee, 2)
    const customer = resolvePacketaCustomerCodFee(settings, {
      paymentMethod: 'dobierka',
      deliveryMethod: 'packeta-box',
      productsSubtotal: 150,
      grandTotalBeforeCod: 150,
    })
    assert.equal(customer, null)
  })

  it('card-on-COD sender cost is computed but separate from customer fee', () => {
    const settings = normalizeCartCheckoutSettings({
      carrierConfigs: {
        packeta: {
          cod: {
            cardOnCod: {
              enabled: true,
              percent: 1.2,
              basis: 'COD_AMOUNT_INCLUDING_VAT',
              chargedTo: 'SENDER',
              affectsCustomerTotal: false,
            },
            customerPrice: {
              mode: 'fixed',
              fixedAmount: 1.5,
              feeAmountsAreNet: false,
            },
          },
        },
      },
    })
    const sender = resolvePacketaCardOnCodSenderCost(settings, 100)
    assert.equal(sender, 1.2)
    const customer = resolvePacketaCustomerCodFee(settings, {
      paymentMethod: 'dobierka',
      deliveryMethod: 'packeta-box',
      productsSubtotal: 100,
      grandTotalBeforeCod: 100,
    })
    assert.equal(customer?.fee, 1.5)
  })
})
