import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Order, OrderItem } from '@prisma/client'

import {
  buildOrderDocumentPdfInput,
  fillPaymentPurposeTemplate,
  formatOrderItemPdfDescription,
  resolvePdfPaymentPurposeTemplate,
} from './order-pdf.builder'
import { getOrderPdfLabels, type OrderPdfLocale } from './order-pdf-labels'

const UA_DEFAULT = 'Оплата за замовлення {orderNumber}'

function baseOrder(overrides: Partial<Order> = {}): Order & { items: OrderItem[] } {
  const now = new Date('2026-09-17T12:00:00.000Z')
  return {
    id: 'ord-1',
    orderNumber: 25,
    status: 'PENDING',
    totalAmount: 9.41 as never,
    productsSubtotal: 4.95 as never,
    deliveryAmount: 3.46 as never,
    packagingAmount: null,
    packagingBoxCount: null,
    packagingPalletCount: null,
    taxAmount: 0 as never,
    taxRatePercent: 23 as never,
    taxCountryCode: 'SK',
    taxRegime: 'seller',
    fxRateUsed: null,
    buyerType: 'individual',
    codFeeAmount: null,
    pointsDiscountAmount: null,
    currency: 'EUR',
    customerFirstName: 'Jan',
    customerLastName: 'Novak',
    customerPatronymic: null,
    customerPhone: '+421900000000',
    customerEmail: 'jan@example.com',
    receiverFirstName: 'Jan',
    receiverLastName: 'Novak',
    receiverPatronymic: null,
    receiverPhone: '+421900000000',
    receiverCompanyName: null,
    deliveryMethod: 'packeta-box',
    deliveryCity: 'Bratislava',
    deliveryBranch: 'zbox-1',
    deliveryBranchLabel: 'Z-BOX Bratislava, Budatínska 24, 851 06 Bratislava',
    deliveryStreet: null,
    deliveryHouseNumber: null,
    deliveryPostalCode: '851 06',
    deliveryCountryCode: 'SK',
    countrySiteCode: 'sk',
    locale: 'sk',
    paymentMethod: 'bank-transfer',
    paymentStatus: null,
    paymentProvider: null,
    stripePaymentId: null,
    monopayInvoiceId: null,
    paidAt: null,
    paymentExpiresAt: null,
    comment: null,
    preferredShipDate: null,
    userId: null,
    createdAt: now,
    updatedAt: now,
    stockReleasedAt: null,
    ...overrides,
    items: [
      {
        id: 'item-1',
        orderId: 'ord-1',
        productVariantId: 'var-1',
        quantity: 1,
        priceAtPurchase: 4.95 as never,
        productName: 'Plant',
        latinName: null,
        productSlug: 'plant',
        variantLabel: null,
        sku: 'SKU1',
        ean: null,
        stockDecremented: 1,
      } as OrderItem,
    ],
  } as Order & { items: OrderItem[] }
}

const market = {
  region: 'sk' as const,
  countrySites: [{ enabled: true, defaultLocale: 'sk' }],
}

const bank = {
  organizationName: 'Green Angels s.r.o.',
  iban: 'SK3112000000198742637541',
  bic: 'GIBASKBX',
  bankName: 'VUB',
  legalAddress: 'Bratislava',
  edrpou: '12345678',
  dic: '',
  icDph: '',
}

describe('PDF payment purpose localization', () => {
  for (const [locale, expected] of [
    ['sk', 'Platba za objednávku ZY-00000025'],
    ['cs', 'Platba za objednávku ZY-00000025'],
    ['de', 'Zahlung für Bestellung ZY-00000025'],
    ['hu', 'Fizetés a(z) ZY-00000025 rendeléshez'],
    ['en', 'Payment for order ZY-00000025'],
    ['uk', 'Оплата за замовлення ZY-00000025'],
  ] as const) {
    it(`${locale}: localized purpose, no UA leak when settings are UA default`, () => {
      const labels = getOrderPdfLabels(locale)
      const template = resolvePdfPaymentPurposeTemplate(UA_DEFAULT, locale, labels.paymentPurposeTemplate)
      const purpose = fillPaymentPurposeTemplate(template, 'ZY-00000025')
      assert.equal(purpose, expected)
      if (locale !== 'uk') {
        assert.equal(purpose.includes('Оплата за замовлення'), false)
      }
    })
  }

  it('uses order.locale for PDF (not market default alone)', () => {
    const input = buildOrderDocumentPdfInput({
      order: baseOrder({ locale: 'de', paymentMethod: 'bank-transfer' }),
      market: market as never,
      bank: bank as never,
      bankDetailsSource: 'cart',
      paymentPurposeTemplate: UA_DEFAULT,
      locale: 'de',
    })
    assert.equal(input.locale, 'de')
    assert.ok(input.bankSection)
    assert.equal(input.bankSection!.purpose, 'Zahlung für Bestellung ZY-00000025')
    assert.equal(input.bankSection!.rows.find((r) => r.label === 'IBAN')?.value, bank.iban)
  })

  it('COD PDF has fee line once and no bank section', () => {
    const input = buildOrderDocumentPdfInput({
      order: baseOrder({
        paymentMethod: 'dobierka',
        codFeeAmount: 1 as never,
        totalAmount: 10.41 as never,
        locale: 'sk',
      }),
      market: market as never,
      bank: bank as never,
      bankDetailsSource: 'cart',
      locale: 'sk',
    })
    assert.equal(input.bankSection, null)
    assert.equal(input.codFeeAmount, 1)
    assert.equal(input.paymentLabel, 'Dobierka')
    const feeLines = input.lines.filter((l) => l.description === 'Poplatok za dobierku')
    assert.equal(feeLines.length, 1)
    assert.equal(input.grandTotal, 10.41)
  })
})

describe('PDF pickup address formatting', () => {
  it('packeta-box uses branch label only (no city/postal duplication)', () => {
    const input = buildOrderDocumentPdfInput({
      order: baseOrder(),
      market: market as never,
      bank: bank as never,
      bankDetailsSource: 'cart',
      locale: 'sk',
    })
    const shipLine = input.shipTo.lines[0]
    assert.equal(shipLine, 'Z-BOX Bratislava, Budatínska 24, 851 06 Bratislava')
    assert.equal((shipLine.match(/Budatínska 24/g) ?? []).length, 1)
    assert.equal((shipLine.match(/851 06/g) ?? []).length, 1)
  })

  it('courier address still joins structured fields', () => {
    const input = buildOrderDocumentPdfInput({
      order: baseOrder({
        deliveryMethod: 'gls-courier',
        deliveryBranch: null,
        deliveryBranchLabel: null,
        deliveryStreet: 'Hlavná',
        deliveryHouseNumber: '1',
        deliveryCity: 'Košice',
        deliveryPostalCode: '040 01',
      }),
      market: market as never,
      bank: bank as never,
      bankDetailsSource: 'cart',
      locale: 'sk',
    })
    assert.equal(input.shipTo.lines[0], 'Košice, Hlavná, 1, 040 01')
  })
})

describe('resolvePdfPaymentPurposeTemplate', () => {
  it('keeps non-UA custom CMS template on SK', () => {
    const custom = 'VS {orderNumber} Green Angels'
    assert.equal(
      resolvePdfPaymentPurposeTemplate(custom, 'sk', getOrderPdfLabels('sk').paymentPurposeTemplate),
      custom,
    )
  })
})

describe('formatOrderItemPdfDescription', () => {
  it('stacks localized name, Latin, and variant when present', () => {
    assert.equal(
      formatOrderItemPdfDescription({
        productName: "Tuja západná 'Smaragd'",
        latinName: "Thuja occidentalis 'Smaragd'",
        variantLabel: 'C5 / H80–100',
      }),
      "Tuja západná 'Smaragd'\nThuja occidentalis 'Smaragd'\nC5 / H80–100",
    )
  })

  it('omits blank Latin / variant lines', () => {
    assert.equal(
      formatOrderItemPdfDescription({
        productName: 'Plant',
        latinName: null,
        variantLabel: '  ',
      }),
      'Plant',
    )
  })
})
