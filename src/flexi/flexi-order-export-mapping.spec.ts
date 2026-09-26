import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
  applyFlexiOrderHeaderMapping,
  buildFlexiAncillaryExportLines,
  buildFlexiCatalogProductLine,
  flexiIsoDate,
  mapPaymentMethodToFlexiCode,
  normalizeDeliveryMethodCodes,
  resolveDeliveryFlexiAbbreviation,
  resolveFlexiAddressCountryCode,
  resolveFlexiDocumentCountries,
  resolveFlexiDocumentStatCode,
  resolveFlexiLineVatFields,
  resolveFlexiShippingCenaMj,
  resolveFlexiVatCountryCode,
  toFlexiRelationCode,
} from './flexi-order-export-mapping'

const createdAt = new Date('2026-08-14T16:55:34.216Z')
const preferredShipDate = new Date('2026-08-21T12:00:00.000Z')

function sampleDocument() {
  return {
    datVyst: flexiIsoDate(createdAt),
    datTermin: flexiIsoDate(preferredShipDate),
    doprava: 'packeta-courier — Prazska 12, Praha, 877555',
  } as Record<string, unknown>
}

describe('flexi order export mapping', () => {
  it('maps payment methods to code: refs', () => {
    assert.equal(toFlexiRelationCode(mapPaymentMethodToFlexiCode('card-online')), 'code:KARTA')
    assert.equal(toFlexiRelationCode(mapPaymentMethodToFlexiCode('bank-transfer')), 'code:PREVOD')
    assert.equal(
      toFlexiRelationCode(mapPaymentMethodToFlexiCode('bank-transfer-legal')),
      'code:PREVOD',
    )
    assert.equal(toFlexiRelationCode(mapPaymentMethodToFlexiCode('dobierka')), 'code:DOBIERKA')
    assert.equal(mapPaymentMethodToFlexiCode('pay-on-pickup'), undefined)
    assert.equal(mapPaymentMethodToFlexiCode('unknown-pay'), undefined)
  })

  it('maps default delivery abbreviations to code: refs', () => {
    const codes = normalizeDeliveryMethodCodes(undefined)
    assert.equal(
      toFlexiRelationCode(resolveDeliveryFlexiAbbreviation('packeta-box', codes)),
      'code:PACKETA_PICKUP',
    )
    assert.equal(
      toFlexiRelationCode(resolveDeliveryFlexiAbbreviation('packeta-courier', codes)),
      'code:PACKETA_COURIER',
    )
    assert.equal(toFlexiRelationCode(resolveDeliveryFlexiAbbreviation('pickup', codes)), 'code:PICKUP')
    assert.equal(
      toFlexiRelationCode(resolveDeliveryFlexiAbbreviation('gls-courier', codes)),
      'code:GLS_COURIER',
    )
  })

  it('uses Backoffice override without mapper code change', () => {
    const codes = normalizeDeliveryMethodCodes({ 'gls-courier': 'GLS_EXPRESS' })
    assert.equal(
      toFlexiRelationCode(resolveDeliveryFlexiAbbreviation('gls-courier', codes)),
      'code:GLS_EXPRESS',
    )
  })

  it('omits formaDopravy when mapping is empty', () => {
    const codes = normalizeDeliveryMethodCodes({
      'packeta-courier': '',
      'nova-poshta-branch': '',
    })
    assert.equal(resolveDeliveryFlexiAbbreviation('packeta-courier', codes), undefined)
    assert.equal(resolveDeliveryFlexiAbbreviation('nova-poshta-branch', codes), undefined)
  })

  it('fills default delivery codes when old Flexi settings omit the field', () => {
    const codes = normalizeDeliveryMethodCodes(null)
    assert.deepEqual(
      {
        'packeta-box': codes['packeta-box'],
        'packeta-courier': codes['packeta-courier'],
        pickup: codes.pickup,
        'gls-courier': codes['gls-courier'],
      },
      DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
    )
  })

  it('puts Packeta point id on branchId only for packeta-box', () => {
    const box = sampleDocument()
    applyFlexiOrderHeaderMapping(box, {
      createdAt,
      paymentMethod: 'bank-transfer',
      deliveryMethod: 'packeta-box',
      deliveryBranch: '123456',
      deliveryMethodCodes: DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
    })
    assert.equal(box.branchId, '123456')
    assert.equal(box.formaDopravy, 'code:PACKETA_PICKUP')

    const boxEmpty = sampleDocument()
    applyFlexiOrderHeaderMapping(boxEmpty, {
      createdAt,
      paymentMethod: 'bank-transfer',
      deliveryMethod: 'packeta-box',
      deliveryBranch: '   ',
      deliveryMethodCodes: DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
    })
    assert.equal(boxEmpty.branchId, undefined)

    const courier = sampleDocument()
    applyFlexiOrderHeaderMapping(courier, {
      createdAt,
      paymentMethod: 'bank-transfer',
      deliveryMethod: 'packeta-courier',
      deliveryBranch: '123456',
      deliveryMethodCodes: DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
    })
    assert.equal(courier.branchId, undefined)
    assert.equal(courier.formaDopravy, 'code:PACKETA_COURIER')

    for (const method of ['pickup', 'gls-courier'] as const) {
      const doc = sampleDocument()
      applyFlexiOrderHeaderMapping(doc, {
        createdAt,
        paymentMethod: 'dobierka',
        deliveryMethod: method,
        deliveryBranch: 'should-not-use',
        deliveryMethodCodes: DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
      })
      assert.equal(doc.branchId, undefined)
    }
  })

  it('builds bank-transfer + packeta-courier payload fields without touching datVyst/datTermin/doprava', () => {
    const document = sampleDocument()
    applyFlexiOrderHeaderMapping(document, {
      createdAt,
      paymentMethod: 'bank-transfer',
      deliveryMethod: 'packeta-courier',
      deliveryBranch: null,
      deliveryMethodCodes: DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
    })
    assert.equal(document.datObj, '2026-08-14')
    assert.equal(document.datVyst, '2026-08-14')
    assert.equal(document.datTermin, '2026-08-21')
    assert.equal(document.formaDopravy, 'code:PACKETA_COURIER')
    assert.equal(document.formaUhradyCis, 'code:PREVOD')
    assert.equal(document.branchId, undefined)
    assert.equal(document.doprava, 'packeta-courier — Prazska 12, Praha, 877555')
  })

  it('skips formaDopravy on unknown method but leaves doprava', () => {
    const document = sampleDocument()
    applyFlexiOrderHeaderMapping(document, {
      createdAt,
      paymentMethod: 'bank-transfer',
      deliveryMethod: 'new-carrier',
      deliveryMethodCodes: DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
    })
    assert.equal(document.formaDopravy, undefined)
    assert.equal(document.doprava, 'packeta-courier — Prazska 12, Praha, 877555')
    assert.equal(document.formaUhradyCis, 'code:PREVOD')
  })
})

describe('Flexi document.stat (address) vs document.statDph (VAT)', () => {
  it('A. SK B2C seller: stat=SK, statDph=SK, szbDph=23', () => {
    const countries = resolveFlexiDocumentCountries({
      billingCountryCode: 'sk',
      taxRegime: 'seller',
      taxCountryCode: 'sk',
      deliveryCountryCode: 'sk',
      currency: 'EUR',
    })
    const vat = resolveFlexiLineVatFields({
      taxRegime: 'seller',
      taxRatePercent: 23,
    })
    assert.equal(countries.addressCountryCode, 'SK')
    assert.equal(countries.vatCountryCode, 'SK')
    assert.equal(countries.usedLegacyAddressFallback, false)
    assert.equal(vat.szbDph, 23)
    assert.equal(vat.typSzbDph, undefined)
  })

  it('B. AT B2C seller: stat=AT, statDph=SK, szbDph=23 (live-confirmed split)', () => {
    const countries = resolveFlexiDocumentCountries({
      billingCountryCode: 'at',
      taxRegime: 'seller',
      taxCountryCode: 'sk',
      deliveryCountryCode: 'at',
      currency: 'EUR',
    })
    const vat = resolveFlexiLineVatFields({
      taxRegime: 'seller',
      taxRatePercent: 23,
    })
    assert.equal(countries.addressCountryCode, 'AT')
    assert.equal(countries.vatCountryCode, 'SK')
    assert.equal(vat.szbDph, 23)
    // Regression: must NOT collapse address into tax country
    assert.notEqual(countries.addressCountryCode, 'SK')
    // Regression: VAT country must be set (never AT-without-statDph path)
    assert.equal(countries.vatCountryCode, 'SK')
  })

  it('C. AT B2C destination: stat=AT, statDph=AT (rate stays on Order snapshot)', () => {
    const countries = resolveFlexiDocumentCountries({
      billingCountryCode: 'at',
      taxRegime: 'destination',
      taxCountryCode: 'at',
      deliveryCountryCode: 'at',
      currency: 'EUR',
    })
    assert.equal(countries.addressCountryCode, 'AT')
    assert.equal(countries.vatCountryCode, 'AT')
    // Mapper does not invent destination rate — only country fields.
    assert.equal(resolveFlexiVatCountryCode({
      taxRegime: 'destination',
      taxCountryCode: 'at',
    }), 'AT')
  })

  it('D. DE B2B reverse charge: stat=DE, statDph=SK, typSzbDph=dphOsv', () => {
    const countries = resolveFlexiDocumentCountries({
      billingCountryCode: 'de',
      taxRegime: 'reverse_charge',
      taxCountryCode: 'de',
      deliveryCountryCode: 'de',
      currency: 'EUR',
    })
    const vat = resolveFlexiLineVatFields({
      taxRegime: 'reverse_charge',
      taxRatePercent: 0,
    })
    assert.equal(countries.addressCountryCode, 'DE')
    assert.equal(countries.vatCountryCode, 'SK')
    assert.equal(vat.szbDph, 0)
    assert.equal(vat.typSzbDph, 'typSzbDph.dphOsv')
    // Buyer VAT CC must not become Stát DPH
    assert.notEqual(countries.vatCountryCode, 'DE')
  })

  it('E. SK billing / AT shipping countries: address SK, VAT SK (faStat tested in address mapping)', () => {
    const countries = resolveFlexiDocumentCountries({
      billingCountryCode: 'sk',
      taxRegime: 'seller',
      taxCountryCode: 'sk',
      deliveryCountryCode: 'at',
      currency: 'EUR',
    })
    assert.equal(countries.addressCountryCode, 'SK')
    assert.equal(countries.vatCountryCode, 'SK')
    assert.equal(resolveFlexiAddressCountryCode('sk'), 'SK')
  })

  it('F. Packeta AT seller: billing drives stat; delivery country is separate', () => {
    const countries = resolveFlexiDocumentCountries({
      billingCountryCode: 'at',
      taxRegime: 'seller',
      taxCountryCode: 'sk',
      deliveryCountryCode: 'at',
      currency: 'EUR',
    })
    assert.equal(countries.addressCountryCode, 'AT')
    assert.equal(countries.vatCountryCode, 'SK')
  })

  it('G. Legacy without billingCountryCode: VAT-safe stat fallback (seller+AT ship → SK)', () => {
    const countries = resolveFlexiDocumentCountries({
      billingCountryCode: null,
      taxRegime: 'seller',
      taxCountryCode: 'sk',
      deliveryCountryCode: 'at',
      currency: 'EUR',
    })
    assert.equal(countries.usedLegacyAddressFallback, true)
    assert.equal(countries.addressCountryCode, 'SK')
    assert.equal(countries.vatCountryCode, 'SK')
    // Legacy helper itself must not use ship-to for seller
    assert.equal(
      resolveFlexiDocumentStatCode({
        taxRegime: 'seller',
        taxCountryCode: null,
        deliveryCountryCode: 'at',
        currency: 'EUR',
      }),
      'SK',
    )
  })

  it('regression: AT seller must emit both code:AT and code:SK (not AT alone, not SK address)', () => {
    const countries = resolveFlexiDocumentCountries({
      billingCountryCode: 'AT',
      taxRegime: 'seller',
      taxCountryCode: 'sk',
      deliveryCountryCode: 'at',
      currency: 'EUR',
    })
    assert.equal(`code:${countries.addressCountryCode}`, 'code:AT')
    assert.equal(`code:${countries.vatCountryCode}`, 'code:SK')
  })
})

describe('Flexi shipping + COD fee merge (export only)', () => {
  it('bank transfer: shipping only, no COD in cenaMj', () => {
    assert.equal(resolveFlexiShippingCenaMj(5, 0), 5)
    const lines = buildFlexiAncillaryExportLines({
      deliveryAmount: 5,
      packagingAmount: 0,
      codFeeAmount: 0,
      shippingCenikKod: 'SHIPPING',
      boxesCenikKod: 'BOXES',
    })
    assert.deepEqual(lines, [
      { cenik: 'code:SHIPPING', mnozMj: 1, cenaMj: 5, nazev: 'Doprava / Shipping' },
    ])
    assert.equal(mapPaymentMethodToFlexiCode('bank-transfer'), 'PREVOD')
  })

  it('COD: shipping + fee merged; no separate COD cenik; forma DOBIERKA', () => {
    assert.equal(resolveFlexiShippingCenaMj(5, 1), 6)
    const lines = buildFlexiAncillaryExportLines({
      deliveryAmount: 5,
      packagingAmount: 0,
      codFeeAmount: 1,
      shippingCenikKod: 'SHIPPING',
      boxesCenikKod: 'BOXES',
    })
    assert.equal(lines.length, 1)
    assert.equal(lines[0].cenik, 'code:SHIPPING')
    assert.equal(lines[0].cenaMj, 6)
    assert.equal(lines.some((l) => l.cenik.includes('COD')), false)
    assert.equal(mapPaymentMethodToFlexiCode('dobierka'), 'DOBIERKA')
  })

  it('COD with zero fee: shipping unchanged', () => {
    const lines = buildFlexiAncillaryExportLines({
      deliveryAmount: 5,
      packagingAmount: 0,
      codFeeAmount: 0,
      shippingCenikKod: 'SHIPPING',
      boxesCenikKod: 'BOXES',
    })
    assert.equal(lines[0].cenaMj, 5)
  })

  it('COD fee alone still creates shipping line (free delivery + fee)', () => {
    const lines = buildFlexiAncillaryExportLines({
      deliveryAmount: 0,
      packagingAmount: 0,
      codFeeAmount: 1,
      shippingCenikKod: 'SHIPPING',
      boxesCenikKod: 'BOXES',
    })
    assert.deepEqual(lines, [
      { cenik: 'code:SHIPPING', mnozMj: 1, cenaMj: 1, nazev: 'Doprava / Shipping' },
    ])
  })

  it('packaging stays a separate boxes line (not merged into shipping)', () => {
    const lines = buildFlexiAncillaryExportLines({
      deliveryAmount: 5,
      packagingAmount: 2,
      packagingBoxCount: 2,
      codFeeAmount: 1,
      shippingCenikKod: 'SHIPPING',
      boxesCenikKod: 'BOXES',
    })
    assert.equal(lines.length, 2)
    assert.equal(lines[0].cenaMj, 6)
    assert.equal(lines[1].cenik, 'code:BOXES')
    assert.equal(lines[1].mnozMj, 2)
    assert.equal(lines[1].cenaMj, 1)
  })

  it('SK + OSS AT: same line VAT fields apply to merged shipping (typCeny.sDph basis)', () => {
    const skVat = resolveFlexiLineVatFields({ taxRegime: 'seller', taxRatePercent: 23 })
    const atVat = resolveFlexiLineVatFields({ taxRegime: 'destination', taxRatePercent: 20 })
    assert.equal(skVat.szbDph, 23)
    assert.equal(atVat.szbDph, 20)
    // Merged cenaMj is sum of order snapshot fee amounts (already customer-facing).
    assert.equal(resolveFlexiShippingCenaMj(5.0, 1.0), 6.0)
  })

  it('card-online payment mapping unchanged', () => {
    assert.equal(mapPaymentMethodToFlexiCode('card-online'), 'KARTA')
  })
})

describe('buildFlexiCatalogProductLine', () => {
  it('references Ceník by SKU and omits nazev so ABRA owns the Latin line name', () => {
    const line = buildFlexiCatalogProductLine({
      sku: 'SMARAGD-C5',
      quantity: 2,
      priceAtPurchase: 14.35,
    })
    assert.deepEqual(line, {
      cenik: 'code:SMARAGD-C5',
      mnozMj: 2,
      cenaMj: 14.35,
    })
    assert.equal('nazev' in line, false)
  })

  /**
   * Manual integration smoke (not CI — needs Flexi + DB):
   * 1) Ensure API Prisma Client matches schema (entrypoint ensure_prisma_client).
   * 2) Create card-online order for a product with Product.latinName set.
   * 3) Assert create response + OrderItem.latinName == Product.latinName.
   * 4) Export to Flexi; confirm outbound catalog line has cenik/mnozMj/cenaMj and no nazev.
   * 5) GET polozka: nazev should equal Ceník.nazev (often includes size suffix, e.g. "… - C2"),
   *    not OrderItem.productName (localized) and not necessarily bare OrderItem.latinName.
   */
  it('documents Flexi omit-nazev manual smoke expectations', () => {
    assert.equal('nazev' in buildFlexiCatalogProductLine({ sku: 'X', quantity: 1, priceAtPurchase: 1 }), false)
  })
})
