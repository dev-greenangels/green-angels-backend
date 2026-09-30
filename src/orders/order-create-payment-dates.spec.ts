import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * EU order/payment/ABRA: executeCreate() wiring for paymentDueAt / shipByDate.
 * Full behavioral coverage of `executeCreate` needs ~20 mocked collaborators
 * (pricing, settings, dispatchCalendar, flexi, packeta, vies, …) — instead we
 * assert the exact code shape, matching the static-contract style already used
 * for `post-order-cart-clear.spec.ts` / `order-local-delete.spec.ts` in this file.
 * Real end-to-end date math is covered by `dispatch-calendar.service.spec.ts`
 * and `order-payment-lifecycle.shipdate.spec.ts` (applyPaymentSuccess).
 */
describe('OrdersService.executeCreate — payment/shipping date contracts', () => {
  const text = readFileSync(
    resolve(process.cwd(), 'src/orders/orders.service.ts'),
    'utf8',
  )

  function slice(fromMarker: string, toMarker: string): string {
    const from = text.indexOf(fromMarker)
    const to = text.indexOf(toMarker, from)
    assert.notEqual(from, -1, `marker not found: ${fromMarker}`)
    assert.notEqual(to, -1, `marker not found: ${toMarker}`)
    return text.slice(from, to)
  }

  it('card OR bank-transfer → AWAITING_PAYMENT; COD/pay-on-pickup → PENDING', () => {
    const block = slice('const initialStatus: OrderStatus =', 'shouldExportNow')
    assert.match(block, /isCardPaymentMethod\(paymentMethod\)\s*\|\|\s*isBankPaymentMethod\(paymentMethod\)/)
    assert.match(block, /'AWAITING_PAYMENT'/)
    assert.match(block, /'PENDING'/)
  })

  it('post-create date block: card sets paymentExpiresAt, bank sets paymentDueAt, COD sets shipByDate', () => {
    const block = slice(
      'let paymentExpiresAtValue: Date | null = null',
      'REL-002: conditional stock reservation',
    )

    // Card branch — only paymentExpiresAt, from paymentExpiresAtFrom(created.createdAt).
    assert.match(block, /isCardPaymentMethod\(paymentMethod\)\s*\)\s*\{\s*\n\s*paymentExpiresAtValue = this\.paymentLifecycle\.paymentExpiresAtFrom\(created\.createdAt\)/)

    // Bank branch — paymentDueAt from createdAt + bankPaymentTermBusinessDays,
    // via the calendar-aware helpers, end-of-business-day, market TZ.
    assert.match(block, /isBankPaymentMethod\(paymentMethod\)/)
    const bankBranch = slice(
      'else if (isBankPaymentMethod(paymentMethod)) {',
      '} else if (isCodPaymentMethod(paymentMethod)) {',
    )
    assert.match(bankBranch, /created\.createdAt/)
    assert.match(bankBranch, /cartSettings\.bankPaymentTermBusinessDays/)
    assert.match(bankBranch, /this\.dispatchCalendar\.addOpenBusinessDays/)
    assert.match(bankBranch, /this\.dispatchCalendar\.endOfBusinessDateUtc/)
    // preferredShipDate must NEVER influence paymentDueAt.
    assert.equal(bankBranch.includes('preferredShipDate'), false)
    assert.match(bankBranch, /paymentDueAtValue = this\.dispatchCalendar\.endOfBusinessDateUtc/)

    // COD branch — shipByDate from createdAt + shippingLeadTimeMaxBusinessDays.
    const codBranch = slice(
      'else if (isCodPaymentMethod(paymentMethod)) {',
      'if (paymentExpiresAtValue || paymentDueAtValue || shipByDateValue) {',
    )
    assert.match(codBranch, /created\.createdAt/)
    assert.match(codBranch, /dispatchSettings\.shippingLeadTimeMaxBusinessDays/)
    assert.equal(codBranch.includes('preferredShipDate'), false)
    assert.match(codBranch, /shipByDateValue = this\.dispatchCalendar\.endOfBusinessDateUtc/)

    // Card/bank never get shipByDate at create; only COD does.
    assert.equal(bankBranch.includes('shipByDateValue ='), false)
    const cardBranch = slice(
      'if (isCardPaymentMethod(paymentMethod)) {',
      'else if (isBankPaymentMethod(paymentMethod)) {',
    )
    assert.equal(cardBranch.includes('paymentDueAtValue ='), false)
    assert.equal(cardBranch.includes('shipByDateValue ='), false)
  })

  it('response building: bank exposes paymentDueAt, COD exposes shipByDate (create response)', () => {
    const block = slice(
      "if (paymentMethod === ONLINE_CARD_PAYMENT_METHOD) {\n      const payment = await this.payments.createPaymentForOrder",
      '// LOCAL async export',
    )
    assert.match(block, /isBankPaymentMethod\(paymentMethod\) && order\.paymentDueAtValue/)
    assert.match(block, /response\.paymentDueAt = order\.paymentDueAtValue\.toISOString\(\)/)
    assert.match(block, /isCodPaymentMethod\(paymentMethod\) && order\.shipByDateValue/)
    assert.match(block, /response\.shipByDate = order\.shipByDateValue\.toISOString\(\)/)
  })

  it('BackstageOrderDetail / CreatedOrderResponse / PublicOrderConfirmation expose paymentDueAt + shipByDate', () => {
    assert.match(text, /paymentDueAt: string \| null\s*\n\s*\/\*\* COD at create; card\/bank set on payment success/)
    assert.match(text, /paymentDueAt\?: string\s*\n\s*\/\*\* COD only at create/)
    assert.match(text, /paymentDueAt: order\.paymentDueAt\?\.toISOString\(\) \?\? null/)
    assert.match(text, /shipByDate: order\.shipByDate\?\.toISOString\(\) \?\? null/)
  })
})
