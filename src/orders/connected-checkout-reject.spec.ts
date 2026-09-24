import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isConnectedCheckoutStockReject } from './connected-checkout-reject'
import { isFlexiStockShortageMessage } from './erp-sync.errors'

describe('isConnectedCheckoutStockReject', () => {
  it('treats stock hint unavailable as stock', () => {
    assert.equal(
      isConnectedCheckoutStockReject({
        exportMessage: 'Flexi HTTP 400: formaUhradyCis not found',
        stockHintUnavailable: true,
      }),
      true,
    )
  })

  it('treats stock-like Flexi message as stock even without hint', () => {
    assert.equal(
      isConnectedCheckoutStockReject({
        exportMessage: 'Nedostatek zásob na skladě',
        stockHintUnavailable: false,
      }),
      true,
    )
    assert.equal(isFlexiStockShortageMessage('not enough stock for SKU'), true)
  })

  it('does not treat arbitrary business reject as stock', () => {
    assert.equal(
      isConnectedCheckoutStockReject({
        exportMessage:
          'Flexi HTTP 400: {"message":"Záznam nebyl v datovém zdroji nalezen","forValidation":"formaUhradyCis"}',
        stockHintUnavailable: false,
      }),
      false,
    )
  })
})
