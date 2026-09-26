/** Website payment slug → Flexi forma-uhrady kod. */
import {
  resolvePackagingCommercialLines,
  type PackagingCommercialLine,
} from '../pricing/packaging-commercial-lines'

export const PAYMENT_METHOD_TO_FLEXI_CODE: Record<string, string> = {
  'card-online': 'KARTA',
  'bank-transfer': 'PREVOD',
  'bank-transfer-legal': 'PREVOD',
  dobierka: 'DOBIERKA',
  // pay-on-pickup: do NOT map to DOBIERKA (carrier COD). Until ABRA has a dedicated
  // forma úhrady (e.g. HOTOV / OSOBNI — create in Flexi first), omit formaUhradyCis.
}

/**
 * Default Flexi forma-dopravy abbreviations for known website methods.
 * Source of truth at runtime is FlexiSettings.deliveryMethodCodes (Backoffice).
 */
export const DEFAULT_FLEXI_DELIVERY_METHOD_CODES: Record<string, string> = {
  'packeta-box': 'PACKETA_PICKUP',
  'packeta-courier': 'PACKETA_COURIER',
  pickup: 'PICKUP',
  'gls-courier': 'GLS_COURIER',
}

export function flexiIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function toFlexiRelationCode(abbreviation: string | null | undefined): string | undefined {
  const kod = abbreviation?.trim()
  if (!kod) return undefined
  return `code:${kod}`
}

export function mapPaymentMethodToFlexiCode(paymentMethod: string): string | undefined {
  const kod = PAYMENT_METHOD_TO_FLEXI_CODE[paymentMethod.trim()]
  return kod || undefined
}

export function resolveDeliveryFlexiAbbreviation(
  deliveryMethod: string,
  deliveryMethodCodes: Record<string, string> | null | undefined,
): string | undefined {
  const slug = deliveryMethod.trim()
  if (!slug) return undefined
  const kod = deliveryMethodCodes?.[slug]?.trim()
  return kod || undefined
}

export function normalizeDeliveryMethodCodes(raw: unknown): Record<string, string> {
  const result: Record<string, string> = { ...DEFAULT_FLEXI_DELIVERY_METHOD_CODES }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const slug = key.trim()
    if (!slug) continue
    if (typeof value !== 'string') continue
    result[slug] = value.trim().toUpperCase()
  }
  return result
}

export type FlexiOrderExportMappingInput = {
  createdAt: Date
  paymentMethod: string
  deliveryMethod: string
  deliveryBranch?: string | null
  deliveryMethodCodes: Record<string, string>
}

/** Order address fields used for Flexi document + Adresar sídlo. */
export type FlexiOrderAddressSource = {
  deliveryMethod: string
  customerFirstName: string
  customerLastName: string
  billingFirstName?: string | null
  billingLastName?: string | null
  receiverFirstName: string
  receiverLastName: string
  receiverCompanyName?: string | null
  companyLegalName?: string | null
  companyIco?: string | null
  companyVatId?: string | null
  companyStreet?: string | null
  companyCity?: string | null
  companyPostalCode?: string | null
  billingStreet?: string | null
  billingHouseNumber?: string | null
  billingCity?: string | null
  billingPostalCode?: string | null
  billingCountryCode?: string | null
  deliveryStreet?: string | null
  deliveryHouseNumber?: string | null
  deliveryCity?: string | null
  deliveryPostalCode?: string | null
  deliveryCountryCode?: string | null
  deliveryBranch?: string | null
  deliveryBranchLabel?: string | null
}

export type FlexiOrderAddressMapping = {
  /** True when Order.billing* snapshot is present (new SK/EU path). */
  hasBillingSnapshot: boolean
  /** Adresar / document sídlo — never Packeta point for new or legacy packeta-box. */
  adresarStreet: string
  adresarCity: string
  adresarPostal: string
  document: {
    nazFirmy: string
    ulice?: string
    mesto?: string
    psc?: string
    postovniShodna?: boolean
    faNazev?: string
    faUlice?: string
    faMesto?: string
    faPsc?: string
    faStat?: string
    doprava: string
  }
}

function joinStreet(street?: string | null, house?: string | null): string {
  return [street?.trim(), house?.trim()].filter(Boolean).join(' ').trim()
}

function normCountryCode(code?: string | null): string | undefined {
  const c = code?.trim().toUpperCase()
  return c || undefined
}

function addressesEqual(a: {
  street: string
  city: string
  postal: string
  country?: string
}, b: {
  street: string
  city: string
  postal: string
  country?: string
}): boolean {
  const nc = (v?: string) => (v ?? '').trim().toLowerCase()
  return (
    nc(a.street) === nc(b.street) &&
    nc(a.city) === nc(b.city) &&
    nc(a.postal) === nc(b.postal) &&
    nc(a.country) === nc(b.country)
  )
}

/**
 * Resolves document + Adresar address blocks.
 * New orders (billing* present): billing → ulice*; delivery/point → fa* when different.
 * Legacy (billing* null): keep prior courier/B2B behaviour; Packeta pickup never writes
 * point city/psc into ulice/Adresar sídlo.
 */
export function resolveFlexiOrderAddressMapping(
  order: FlexiOrderAddressSource,
): FlexiOrderAddressMapping {
  const isB2b = Boolean(order.companyIco?.trim() || order.companyVatId?.trim())
  const contactName = `${order.customerFirstName} ${order.customerLastName}`.trim()
  const billingPersonName = `${
    order.billingFirstName?.trim() || order.customerFirstName
  } ${order.billingLastName?.trim() || order.customerLastName}`.trim()
  const receiverName = `${order.receiverFirstName} ${order.receiverLastName}`.trim()
  const hasDifferentReceiver =
    Boolean(receiverName) &&
    (order.receiverFirstName !== order.customerFirstName ||
      order.receiverLastName !== order.customerLastName)
  const nazFirmy = isB2b
    ? (order.companyLegalName?.trim() || contactName)
    : billingPersonName

  const billingStreetJoined = joinStreet(order.billingStreet, order.billingHouseNumber)
  const hasBillingSnapshot = Boolean(
    billingStreetJoined ||
      order.billingCity?.trim() ||
      order.billingPostalCode?.trim(),
  )

  const shippingStreet = joinStreet(order.deliveryStreet, order.deliveryHouseNumber)
  const shippingCity = (order.deliveryCity ?? '').trim()
  const shippingPostal = (order.deliveryPostalCode ?? '').trim()
  const shippingCountry = normCountryCode(order.deliveryCountryCode)
  const branch = (order.deliveryBranch ?? '').trim()
  const branchLabel = (order.deliveryBranchLabel ?? '').trim()
  const method = order.deliveryMethod.trim()

  const dopravaParts = [method]
  if (method === 'packeta-box' && branch) {
    dopravaParts.push(`PacketaPoint:${branch}`)
  } else if (branchLabel || branch) {
    dopravaParts.push(branchLabel || branch)
  }
  if (shippingStreet || shippingCity || shippingPostal) {
    dopravaParts.push(
      [shippingStreet, shippingCity, shippingPostal].filter(Boolean).join(', '),
    )
  }
  const doprava = dopravaParts.filter(Boolean).join(' — ')

  const faNazevDefault = hasDifferentReceiver
    ? receiverName
    : branchLabel || nazFirmy

  if (hasBillingSnapshot) {
    const billStreet = billingStreetJoined
    const billCity = (order.billingCity ?? '').trim()
    const billPostal = (order.billingPostalCode ?? '').trim()
    const billCountry = normCountryCode(order.billingCountryCode)

    const document: FlexiOrderAddressMapping['document'] = {
      nazFirmy,
      doprava,
    }
    if (billStreet) document.ulice = billStreet
    if (billCity) document.mesto = billCity
    if (billPostal) document.psc = billPostal

    const billingBlock = {
      street: billStreet,
      city: billCity,
      postal: billPostal,
      country: billCountry,
    }

    if (method === 'pickup') {
      document.postovniShodna = true
    } else if (method === 'packeta-box') {
      document.postovniShodna = false
      document.faNazev = branchLabel || faNazevDefault
      if (shippingStreet) document.faUlice = shippingStreet
      else if (branchLabel) document.faUlice = branchLabel
      if (shippingCity) document.faMesto = shippingCity
      if (shippingPostal) document.faPsc = shippingPostal
      if (shippingCountry) document.faStat = `code:${shippingCountry}`
    } else {
      // Courier / address delivery
      const shippingBlock = {
        street: shippingStreet,
        city: shippingCity,
        postal: shippingPostal,
        country: shippingCountry,
      }
      const same =
        Boolean(shippingStreet || shippingCity || shippingPostal) &&
        addressesEqual(billingBlock, shippingBlock)
      if (same || !(shippingStreet || shippingCity || shippingPostal)) {
        document.postovniShodna = true
      } else {
        document.postovniShodna = false
        document.faNazev = faNazevDefault
        if (shippingStreet) document.faUlice = shippingStreet
        if (shippingCity) document.faMesto = shippingCity
        if (shippingPostal) document.faPsc = shippingPostal
        if (shippingCountry) document.faStat = `code:${shippingCountry}`
      }
    }

    return {
      hasBillingSnapshot: true,
      adresarStreet: billStreet,
      adresarCity: billCity,
      adresarPostal: billPostal,
      document,
    }
  }

  // —— Legacy path (billing* null) ——
  const companyStreet = (order.companyStreet ?? '').trim()
  const companyCity = (order.companyCity ?? '').trim()
  const companyPostal = (order.companyPostalCode ?? '').trim()

  if (method === 'packeta-box') {
    // Never put Z-BOX city/psc into sídlo / document ulice*
    return {
      hasBillingSnapshot: false,
      adresarStreet: isB2b ? companyStreet : '',
      adresarCity: isB2b ? companyCity : '',
      adresarPostal: isB2b ? companyPostal : '',
      document: {
        nazFirmy,
        postovniShodna: true,
        doprava,
      },
    }
  }

  const street = (isB2b && companyStreet) || shippingStreet
  const city = ((isB2b && companyCity) || shippingCity).trim()
  const postal = ((isB2b && companyPostal) || shippingPostal).trim()

  const document: FlexiOrderAddressMapping['document'] = {
    nazFirmy,
    doprava,
    postovniShodna: true,
  }
  if (street) document.ulice = street
  if (city) document.mesto = city
  if (postal) document.psc = postal

  return {
    hasBillingSnapshot: false,
    adresarStreet: street,
    adresarCity: city,
    adresarPostal: postal,
    document,
  }
}

export type FlexiDocumentStatInput = {
  taxRegime?: string | null
  taxCountryCode?: string | null
  /** Ship-to only — must not drive VAT country for seller/destination. */
  deliveryCountryCode?: string | null
  currency?: string | null
  /** Billing / sídlo country — drives document.stat + adresar.stat when present. */
  billingCountryCode?: string | null
}

function normalizeFlexiCountryCode(code: string): string {
  const countryCode = code.trim().toLowerCase()
  if (countryCode === 'hu') return 'HU'
  if (countryCode === 'at') return 'AT'
  if (countryCode === 'cz') return 'CZ'
  if (countryCode === 'sk' || !countryCode) return 'SK'
  return countryCode.toUpperCase()
}

/**
 * Address / sídlo country for Flexi `document.stat` and `adresar.stat`.
 * Returns null when billingCountryCode is absent (legacy orders).
 */
export function resolveFlexiAddressCountryCode(
  billingCountryCode?: string | null,
): string | null {
  const raw = billingCountryCode?.trim()
  if (!raw) return null
  return normalizeFlexiCountryCode(raw)
}

/**
 * VAT legislation country for Flexi `document.statDph`.
 * Independent of billing/delivery address countries.
 *
 * - seller → SK (Green Angels seller legislation; UAH → UA)
 * - destination → Order.taxCountryCode (OSS snapshot; do not invent rates)
 * - reverse_charge → SK (seller legislation — not buyer VAT CC)
 */
export function resolveFlexiVatCountryCode(input: {
  taxRegime?: string | null
  taxCountryCode?: string | null
  currency?: string | null
}): string {
  const currency = (input.currency || 'EUR').trim().toUpperCase()
  if (currency === 'UAH') return 'UA'

  const regime = (input.taxRegime ?? '').trim()
  const taxCc = (input.taxCountryCode ?? '').trim().toLowerCase()

  if (regime === 'destination') {
    return normalizeFlexiCountryCode(taxCc || 'sk')
  }

  // seller | reverse_charge | empty | unknown → seller legislation
  return 'SK'
}

/**
 * Legacy-only document.stat when billingCountryCode is null.
 * VAT-safe: seller/destination follow taxCountryCode (never ship-to alone),
 * so AT delivery + SK 23% does not write stat=AT without matching rate.
 * reverse_charge / unknown: preserve pre-fix delivery-first selection.
 *
 * New orders with billingCountryCode must use resolveFlexiAddressCountryCode
 * for document.stat and resolveFlexiVatCountryCode for document.statDph.
 */
export function resolveFlexiDocumentStatCode(input: FlexiDocumentStatInput): string {
  const currency = (input.currency || 'EUR').trim().toUpperCase()
  if (currency === 'UAH') return 'UA'

  const regime = (input.taxRegime ?? '').trim()
  const taxCc = (input.taxCountryCode ?? '').trim().toLowerCase()
  const deliveryCc = (input.deliveryCountryCode ?? '').trim().toLowerCase()

  let countryCode: string
  if (regime === 'seller' || regime === 'destination') {
    countryCode = taxCc || 'sk'
  } else {
    countryCode = deliveryCc || taxCc || 'sk'
  }

  return normalizeFlexiCountryCode(countryCode)
}

/**
 * Resolves Flexi document address country (`stat`) + VAT country (`statDph`).
 * New path: billing → stat, tax regime → statDph.
 * Legacy (no billingCountryCode): VAT-safe resolveFlexiDocumentStatCode for stat.
 */
export function resolveFlexiDocumentCountries(input: FlexiDocumentStatInput): {
  addressCountryCode: string
  vatCountryCode: string
  usedLegacyAddressFallback: boolean
} {
  const vatCountryCode = resolveFlexiVatCountryCode(input)
  const fromBilling = resolveFlexiAddressCountryCode(input.billingCountryCode)
  if (fromBilling) {
    return {
      addressCountryCode: fromBilling,
      vatCountryCode,
      usedLegacyAddressFallback: false,
    }
  }
  return {
    addressCountryCode: resolveFlexiDocumentStatCode(input),
    vatCountryCode,
    usedLegacyAddressFallback: true,
  }
}

/** Mirrors exportOrder line VAT fields for unit tests / shared mapping. */
export function resolveFlexiLineVatFields(input: {
  taxRegime?: string | null
  taxRatePercent?: number | null
}): { szbDph?: number; typSzbDph?: string } {
  const taxRegime = (input.taxRegime ?? '').trim()
  const taxRate =
    input.taxRatePercent != null ? Number(input.taxRatePercent) : null
  if (taxRegime === 'reverse_charge') {
    return { szbDph: 0, typSzbDph: 'typSzbDph.dphOsv' }
  }
  if (taxRate != null && Number.isFinite(taxRate)) {
    return { szbDph: taxRate }
  }
  return {}
}

/**
 * Flexi export only: fold persisted COD surcharge into the shipping line unit price.
 * Order.deliveryAmount / Order.codFeeAmount stay separate in the DB and checkout.
 * Both amounts are already customer-facing totals components (same basis as Flexi typCeny.sDph).
 */
export function resolveFlexiShippingCenaMj(
  deliveryAmount: number,
  codFeeAmount: number,
): number {
  const delivery = Number.isFinite(deliveryAmount) ? Math.max(0, deliveryAmount) : 0
  const cod = Number.isFinite(codFeeAmount) ? Math.max(0, codFeeAmount) : 0
  return Math.round((delivery + cod) * 100) / 100
}

export type FlexiAncillaryExportLine = {
  cenik: string
  mnozMj: number
  cenaMj: number
  nazev: string
}

/**
 * Catalog product line for objednávka-přijatá.
 * References Ceník by SKU code only — do NOT send `nazev`.
 * ABRA fills the line name from the Ceník item (Latin botanical name is SoT in ABRA).
 * Variant identity is the SKU/Ceník kod itself (each size has its own kod).
 */
export function buildFlexiCatalogProductLine(item: {
  sku: string
  quantity: number
  priceAtPurchase: number
}): { cenik: string; mnozMj: number; cenaMj: number } {
  return {
    cenik: `code:${item.sku.trim()}`,
    mnozMj: item.quantity,
    cenaMj: item.priceAtPurchase,
  }
}

/**
 * Builds Flexi ancillary fee lines (shipping ± COD, packaging).
 * Does not emit a separate COD cenik line — COD is merged into shipping when > 0.
 *
 * Packaging gross boundaries come from resolvePackagingCommercialLines (shared with
 * checkout VAT). Flexi only maps kind → cenik; missing palletCenikKod falls back to
 * BOXES cenik without changing financial gross / quantity.
 */
export function buildFlexiAncillaryExportLines(input: {
  deliveryAmount: number
  packagingAmount: number
  packagingBoxCount?: number | null
  packagingPalletCount?: number | null
  packagingPalletAmount?: number | null
  codFeeAmount: number
  shippingCenikKod: string
  boxesCenikKod: string
  palletCenikKod?: string
}): FlexiAncillaryExportLine[] {
  const lines: FlexiAncillaryExportLine[] = []
  const shippingKod = input.shippingCenikKod.trim()
  const shippingCena = resolveFlexiShippingCenaMj(input.deliveryAmount, input.codFeeAmount)
  if (shippingCena > 0 && shippingKod) {
    lines.push({
      cenik: `code:${shippingKod}`,
      mnozMj: 1,
      cenaMj: shippingCena,
      nazev: 'Doprava / Shipping',
    })
  }

  const boxesKod = input.boxesCenikKod.trim()
  const palletKod = (input.palletCenikKod ?? '').trim()
  const packagingLines = resolvePackagingCommercialLines({
    packagingAmount: input.packagingAmount,
    packagingBoxCount: input.packagingBoxCount,
    packagingPalletCount: input.packagingPalletCount,
    packagingPalletAmount: input.packagingPalletAmount,
  })

  for (const pkg of packagingLines) {
    const mapped = mapPackagingCommercialLineToFlexi(pkg, {
      boxesCenikKod: boxesKod,
      palletCenikKod: palletKod,
      packagingPalletCount: input.packagingPalletCount ?? 0,
    })
    if (mapped) lines.push(mapped)
  }

  return lines
}

function mapPackagingCommercialLineToFlexi(
  pkg: PackagingCommercialLine,
  cfg: {
    boxesCenikKod: string
    palletCenikKod: string
    packagingPalletCount: number
  },
): FlexiAncillaryExportLine | null {
  if (pkg.kind === 'pallet') {
    const cenikKod = cfg.palletCenikKod || cfg.boxesCenikKod
    if (!cenikKod) return null
    const countLabel =
      cfg.packagingPalletCount > 0 ? cfg.packagingPalletCount : pkg.quantity
    return {
      cenik: `code:${cenikKod}`,
      mnozMj: pkg.quantity,
      cenaMj: pkg.unitGross,
      nazev:
        cfg.palletCenikKod
          ? `Paleta / Pallet (${countLabel})`
          : countLabel > 1
            ? `Balenie / Boxes (palety ${countLabel})`
            : 'Balenie / Boxes',
    }
  }

  if (!cfg.boxesCenikKod) return null
  return {
    cenik: `code:${cfg.boxesCenikKod}`,
    mnozMj: pkg.quantity,
    cenaMj: pkg.unitGross,
    nazev:
      pkg.quantity > 1
        ? `Balenie / Boxes (${pkg.quantity})`
        : 'Balenie / Boxes',
  }
}

/**
 * Gross commercial boundaries for Flexi packaging lines (cenaMj × mnozMj).
 * Used by parity tests against checkout VAT packaging grosses.
 */
export function flexiPackagingCommercialGrosses(input: {
  packagingAmount: number
  packagingBoxCount?: number | null
  packagingPalletCount?: number | null
  packagingPalletAmount?: number | null
}): number[] {
  return resolvePackagingCommercialLines(input).map((line) => line.grossAmount)
}

/**
 * Adds datObj + structured payment/delivery/point fields.
 * Does not set datVyst, datTermin, or doprava.
 */
export function applyFlexiOrderHeaderMapping(
  document: Record<string, unknown>,
  input: FlexiOrderExportMappingInput,
): void {
  document.datObj = flexiIsoDate(input.createdAt)

  const paymentCode = mapPaymentMethodToFlexiCode(input.paymentMethod)
  const paymentRef = toFlexiRelationCode(paymentCode)
  if (paymentRef) document.formaUhradyCis = paymentRef

  const deliveryAbbr = resolveDeliveryFlexiAbbreviation(
    input.deliveryMethod,
    input.deliveryMethodCodes,
  )
  const deliveryRef = toFlexiRelationCode(deliveryAbbr)
  if (deliveryRef) document.formaDopravy = deliveryRef

  if (input.deliveryMethod === 'packeta-box') {
    const pointId = input.deliveryBranch?.trim()
    if (pointId) document.branchId = pointId
  }
}
