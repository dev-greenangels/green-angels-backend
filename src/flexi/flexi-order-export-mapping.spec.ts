import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
  applyFlexiBankAccountMapping,
  applyFlexiOrderHeaderMapping,
  assertFlexiCommercialTotalParity,
  buildFlexiAncillaryExportLines,
  buildFlexiCatalogProductLine,
  flexiIsoDate,
  mapPaymentMethodToFlexiCode,
  normalizeDeliveryMethodCodes,
  resolveBankovniUcetCode,
  resolveDeliveryFlexiAbbreviation,
  resolveFlexiAddressCountryCode,
  resolveFlexiDocumentCountries,
  resolveFlexiDocumentStatCode,
  resolveFlexiLineVatFields,
  resolveFlexiProductCenaMj,
  resolveFlexiShippingCenaMj,
  resolveFlexiTypCenyDphK,
  resolveFlexiVatCountryCode,
  resolveOrderFlexiRepresentedTotal,
  toFlexiKonSymRef,
  toFlexiRelationCode,
  resolveSalesConstantSymbol,
  DEFAULT_SALES_CONSTANT_SYMBOL,
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
  it('maps sales constant symbol to Flexi konSym code:0008 (never as banka.kod)', () => {
    assert.equal(DEFAULT_SALES_CONSTANT_SYMBOL, '0008')
    assert.equal(resolveSalesConstantSymbol(null), '0008')
    assert.equal(resolveSalesConstantSymbol(''), '0008')
    assert.equal(toFlexiKonSymRef('0008'), 'code:0008')
    assert.equal(toFlexiKonSymRef('code:0008'), 'code:0008')
  })

  it('Received Order header: konSym=0008 alongside payment/delivery mapping', () => {
    const document = sampleDocument()
    document.varSym = '37'
    applyFlexiOrderHeaderMapping(document, {
      createdAt,
      paymentMethod: 'card-online',
      deliveryMethod: 'packeta-box',
      deliveryBranch: '39329',
      deliveryMethodCodes: DEFAULT_FLEXI_DELIVERY_METHOD_CODES,
      salesConstantSymbol: '0008',
    })
    assert.equal(document.varSym, '37')
    assert.equal(document.konSym, 'code:0008')
    assert.equal(document.formaUhradyCis, 'code:KARTA')
  })

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

  it('VIES INVALID / ERROR / NO VAT never produce dphOsv; only reverse_charge does', () => {
    assert.equal(
      resolveFlexiLineVatFields({ taxRegime: 'seller', taxRatePercent: 23 }).typSzbDph,
      undefined,
    )
    assert.equal(
      resolveFlexiLineVatFields({ taxRegime: 'destination', taxRatePercent: 21 }).typSzbDph,
      undefined,
    )
    // Persisted non-RC after INVALID or technical ERROR
    assert.deepEqual(resolveFlexiLineVatFields({ taxRegime: 'seller', taxRatePercent: 23 }), {
      szbDph: 23,
    })
    assert.deepEqual(
      resolveFlexiLineVatFields({ taxRegime: 'reverse_charge', taxRatePercent: 0 }),
      { szbDph: 0, typSzbDph: 'typSzbDph.dphOsv' },
    )
  })

  it('VALID + delivery SK stays non-RC in Flexi mapping when taxRegime is seller', () => {
    const vat = resolveFlexiLineVatFields({ taxRegime: 'seller', taxRatePercent: 23 })
    assert.equal(vat.typSzbDph, undefined)
    assert.equal(vat.szbDph, 23)
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
      cenaMj: 14.35,
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
    assert.equal('nazev' in buildFlexiCatalogProductLine({ sku: 'X', quantity: 1, cenaMj: 1 }), false)
  })
})

describe('resolveFlexiProductCenaMj / typCeny / commercial parity', () => {
  it('B2C: commercial snapshot → cenaMj 12.30, typCeny.sDph', () => {
    const cena = resolveFlexiProductCenaMj({
      taxRegime: 'seller',
      priceAtPurchase: 12.3,
      commercialUnitPrice: 12.3,
      commercialLineAmount: 12.3,
    })
    assert.equal(cena.ok, true)
    if (!cena.ok) return
    assert.equal(cena.cenaMj, 12.3)
    assert.equal(cena.source, 'commercial')
    assert.equal(resolveFlexiTypCenyDphK('seller'), 'typCeny.sDph')
    assert.deepEqual(
      buildFlexiCatalogProductLine({ sku: 'SKU', quantity: 1, cenaMj: cena.cenaMj }),
      { cenik: 'code:SKU', mnozMj: 1, cenaMj: 12.3 },
    )
    assert.deepEqual(resolveFlexiLineVatFields({ taxRegime: 'seller', taxRatePercent: 23 }), {
      szbDph: 23,
    })
  })

  it('RC: commercial net 10.00 → cenaMj 10, typCeny.bezDph, dphOsv', () => {
    const cena = resolveFlexiProductCenaMj({
      taxRegime: 'reverse_charge',
      priceAtPurchase: 12.3,
      commercialUnitPrice: 10,
      commercialLineAmount: 10,
    })
    assert.equal(cena.ok, true)
    if (!cena.ok) return
    assert.equal(cena.cenaMj, 10)
    assert.equal(resolveFlexiTypCenyDphK('reverse_charge'), 'typCeny.bezDph')
    assert.deepEqual(
      resolveFlexiLineVatFields({ taxRegime: 'reverse_charge', taxRatePercent: 0 }),
      { szbDph: 0, typSzbDph: 'typSzbDph.dphOsv' },
    )
  })

  it('RC qty3: Flexi commercial total 30.00', () => {
    const cena = resolveFlexiProductCenaMj({
      taxRegime: 'reverse_charge',
      priceAtPurchase: 12.3,
      commercialUnitPrice: 10,
      commercialLineAmount: 30,
    })
    assert.equal(cena.ok, true)
    if (!cena.ok) return
    const line = buildFlexiCatalogProductLine({
      sku: 'SKU',
      quantity: 3,
      cenaMj: cena.cenaMj,
    })
    const parity = assertFlexiCommercialTotalParity({
      lines: [line],
      expectedTotal: 30,
    })
    assert.equal(parity.ok, true)
    assert.equal(parity.payloadTotal, 30)
  })

  it('legacy B2C falls back to priceAtPurchase', () => {
    const cena = resolveFlexiProductCenaMj({
      taxRegime: 'seller',
      priceAtPurchase: 12.3,
      commercialUnitPrice: null,
    })
    assert.equal(cena.ok, true)
    if (!cena.ok) return
    assert.equal(cena.cenaMj, 12.3)
    assert.equal(cena.source, 'priceAtPurchase_legacy')
  })

  it('legacy RC without commercial snapshot is blocked (never export gross as net)', () => {
    const cena = resolveFlexiProductCenaMj({
      taxRegime: 'reverse_charge',
      priceAtPurchase: 12.3,
      commercialUnitPrice: null,
    })
    assert.equal(cena.ok, false)
    if (cena.ok) return
    assert.match(cena.message, /commercialUnitPrice|комерційний/i)
  })

  it('parity fails when payload uses gross under RC expectation', () => {
    const parity = assertFlexiCommercialTotalParity({
      lines: [{ cenaMj: 12.3, mnozMj: 1 }],
      expectedTotal: 10,
    })
    assert.equal(parity.ok, false)
  })

  it('ProductPrice change after order must not affect cenaMj (snapshot only)', () => {
    // Simulate: catalog later 13.50; Order still holds commercial 10.00
    const currentCatalogPrice = 13.5
    const cena = resolveFlexiProductCenaMj({
      taxRegime: 'reverse_charge',
      priceAtPurchase: 12.3,
      commercialUnitPrice: 10,
      commercialLineAmount: 10,
    })
    assert.equal(cena.ok, true)
    if (!cena.ok) return
    assert.equal(cena.cenaMj, 10)
    assert.notEqual(cena.cenaMj, currentCatalogPrice)
  })

  it('represented Order total includes fees; COD merges into shipping line', () => {
    const expected = resolveOrderFlexiRepresentedTotal({
      productsSubtotal: 10,
      deliveryAmount: 4,
      packagingAmount: 2,
      codFeeAmount: 1,
    })
    assert.equal(expected, 17)
    const lines = [
      { cenaMj: 10, mnozMj: 1 },
      ...buildFlexiAncillaryExportLines({
        deliveryAmount: 4,
        packagingAmount: 2,
        packagingBoxCount: 1,
        codFeeAmount: 1,
        shippingCenikKod: 'SHIPPING',
        boxesCenikKod: 'BOXES',
      }).map((l) => ({ cenaMj: l.cenaMj, mnozMj: l.mnozMj })),
    ]
    const parity = assertFlexiCommercialTotalParity({ lines, expectedTotal: expected })
    assert.equal(parity.ok, true)
  })

  it('dphOsv only for reverse_charge (not INVALID/ERROR/no VAT)', () => {
    assert.equal(
      resolveFlexiLineVatFields({ taxRegime: 'seller', taxRatePercent: 0 }).typSzbDph,
      undefined,
    )
    assert.equal(
      resolveFlexiLineVatFields({ taxRegime: 'reverse_charge', taxRatePercent: 0 }).typSzbDph,
      'typSzbDph.dphOsv',
    )
  })
})

describe('resolveBankovniUcetCode / applyFlexiBankAccountMapping', () => {
  const settings = { bankAccountCodeCard: 'STRIPE', bankAccountCodeBank: 'BANKOVNÍ ÚČET' }

  it('CARD: resolves bankAccountCodeCard and writes bankovniUcet', () => {
    assert.equal(
      resolveBankovniUcetCode({ paymentMethod: 'card-online', ...settings }),
      'STRIPE',
    )
    const document: Record<string, unknown> = {}
    applyFlexiBankAccountMapping(document, { paymentMethod: 'card-online', ...settings })
    assert.equal(document.bankovniUcet, 'code:STRIPE')
  })

  it('BANK: resolves bankAccountCodeBank for both bank-transfer variants', () => {
    assert.equal(
      resolveBankovniUcetCode({ paymentMethod: 'bank-transfer', ...settings }),
      'BANKOVNÍ ÚČET',
    )
    assert.equal(
      resolveBankovniUcetCode({ paymentMethod: 'bank-transfer-legal', ...settings }),
      'BANKOVNÍ ÚČET',
    )
    const document: Record<string, unknown> = {}
    applyFlexiBankAccountMapping(document, { paymentMethod: 'bank-transfer', ...settings })
    assert.equal(document.bankovniUcet, 'code:BANKOVNÍ ÚČET')
  })

  it('COD / pay-on-pickup: omits bankovniUcet entirely (does not send empty string)', () => {
    assert.equal(resolveBankovniUcetCode({ paymentMethod: 'dobierka', ...settings }), undefined)
    assert.equal(
      resolveBankovniUcetCode({ paymentMethod: 'pay-on-pickup', ...settings }),
      undefined,
    )
    const document: Record<string, unknown> = {}
    applyFlexiBankAccountMapping(document, { paymentMethod: 'dobierka', ...settings })
    assert.equal('bankovniUcet' in document, false)
  })

  it('clears a previously-set bankovniUcet when the resolved method has none (no stale leak)', () => {
    const document: Record<string, unknown> = { bankovniUcet: 'code:STRIPE' }
    applyFlexiBankAccountMapping(document, { paymentMethod: 'dobierka', ...settings })
    assert.equal('bankovniUcet' in document, false)
  })

  it('empty configured code omits bankovniUcet rather than sending blank', () => {
    assert.equal(
      resolveBankovniUcetCode({
        paymentMethod: 'card-online',
        bankAccountCodeCard: '  ',
        bankAccountCodeBank: 'BANKOVNÍ ÚČET',
      }),
      undefined,
    )
  })
})
