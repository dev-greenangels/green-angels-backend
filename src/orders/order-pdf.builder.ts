import type { Order, OrderItem, OrderViesCheck } from '@prisma/client'

import type { CheckoutBankDetails } from '../settings/cart-checkout.types'
import type { MarketSettings } from '../settings/market.types'
import { formatEuVatId } from '../vies/vies.types'
import type { OrderDocumentPdfInput } from '../mail/order-document-pdf'
import {
  getOrderPdfLabels,
  resolveOrderPdfLocale,
  type OrderPdfLocale,
} from './order-pdf-labels'

type OrderWithItems = Order & {
  items: OrderItem[]
  viesCheck?: OrderViesCheck | null
}

function formatPersonName(first: string, last: string, patronymic?: string | null): string {
  return [last, first, patronymic?.trim()].filter(Boolean).join(' ')
}

function formatDeliveryAddress(order: OrderWithItems, pickupLabel: string): string {
  if (order.deliveryMethod === 'pickup') return pickupLabel
  const parts = [
    order.deliveryCity,
    order.deliveryBranchLabel || order.deliveryBranch,
    order.deliveryStreet,
    order.deliveryHouseNumber,
    order.deliveryPostalCode,
  ].filter(Boolean)
  return parts.join(', ') || '—'
}

function formatBillingAddress(order: OrderWithItems): string[] {
  const lines = [
    order.companyStreet,
    [order.companyPostalCode, order.companyCity].filter(Boolean).join(' '),
  ].filter(Boolean) as string[]
  return lines
}

function isBankTransfer(method: string): boolean {
  return method === 'bank-transfer' || method === 'bank-transfer-legal'
}

function formatOrderNumberDisplay(orderNumber: number): string {
  return `ZY-${String(orderNumber).padStart(8, '0')}`
}

export function buildOrderDocumentPdfInput(input: {
  order: OrderWithItems
  market: Pick<MarketSettings, 'region' | 'countrySites'>
  bank: CheckoutBankDetails
  bankDetailsSource: 'cart' | 'store'
  orderPdfTitle?: string
  paymentPurposeTemplate?: string
  /** Override UI locale (e.g. customer email language). */
  locale?: string
}): OrderDocumentPdfInput {
  const { order, market, bank } = input
  const isSk = market.region === 'sk'
  const region = isSk ? 'sk' : 'ua'
  const siteDefault = isSk
    ? market.countrySites?.find((s) => s.enabled)?.defaultLocale ??
      market.countrySites?.[0]?.defaultLocale ??
      'sk'
    : 'uk'
  const pdfLocale: OrderPdfLocale = resolveOrderPdfLocale(input.locale ?? siteDefault)
  const labels = getOrderPdfLabels(pdfLocale)
  const localeDate = order.createdAt.toISOString().slice(0, 10)
  const taxRate = order.taxRatePercent != null ? Number(order.taxRatePercent) : 0
  const isCompany = order.buyerType === 'company'
  const fullVatId = formatEuVatId(order.vatCountryCode, order.companyVatId)

  const sellerLines = [
    bank.legalAddress,
    bank.edrpou ? (isSk ? `IČO: ${bank.edrpou}` : `ЄДРПОУ: ${bank.edrpou}`) : '',
    bank.dic ? `DIČ: ${bank.dic}` : '',
    bank.icDph ? `IČ DPH / VAT: ${bank.icDph}` : '',
    bank.iban ? `IBAN: ${bank.iban}` : '',
    bank.bic ? `BIC: ${bank.bic}` : '',
    bank.bankName,
  ].filter(Boolean) as string[]

  const buyerName = isCompany
    ? order.companyLegalName?.trim() ||
      formatPersonName(order.customerFirstName, order.customerLastName, order.customerPatronymic)
    : formatPersonName(order.customerFirstName, order.customerLastName, order.customerPatronymic)

  const buyerLines = [
    ...(isCompany ? formatBillingAddress(order) : []),
    order.customerEmail ?? '',
    order.customerPhone,
    ...(isCompany
      ? [
          order.companyIco ? (isSk ? `IČO: ${order.companyIco}` : `ЄДРПОУ: ${order.companyIco}`) : '',
          order.companyDic ? `DIČ: ${order.companyDic}` : '',
          fullVatId ? `IČ DPH / VAT: ${fullVatId}` : '',
        ].filter(Boolean)
      : []),
  ].filter(Boolean) as string[]

  const shipToName = formatPersonName(
    order.receiverFirstName,
    order.receiverLastName,
    order.receiverPatronymic,
  )
  const shipLines = [
    formatDeliveryAddress(order, labels.pickup),
    order.receiverPhone,
    order.receiverCompanyName ?? '',
  ].filter(Boolean)

  const deliveryLabel =
    labels.deliveryMethods[order.deliveryMethod] ?? order.deliveryMethod
  const paymentLabel =
    labels.paymentMethods[order.paymentMethod] ?? order.paymentMethod

  const lineVat =
    order.taxRegime === 'reverse_charge' ? 0 : taxRate > 0 ? taxRate : 0

  const docLines = order.items.map((item) => {
    const unitPrice = Number(item.priceAtPurchase)
    const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100
    const description = item.variantLabel
      ? `${item.productName} (${item.variantLabel})`
      : item.productName
    return {
      description,
      quantity: item.quantity,
      unitPrice,
      vatPercent: lineVat,
      lineTotal,
    }
  })

  const deliveryAmount = order.deliveryAmount != null ? Number(order.deliveryAmount) : 0
  const packagingAmount = order.packagingAmount != null ? Number(order.packagingAmount) : 0
  if (deliveryAmount > 0) {
    docLines.push({
      description: labels.shippingLine,
      quantity: 1,
      unitPrice: deliveryAmount,
      vatPercent: lineVat,
      lineTotal: deliveryAmount,
    })
  }
  if (packagingAmount > 0) {
    docLines.push({
      description: labels.packagingLine,
      quantity: 1,
      unitPrice: packagingAmount,
      vatPercent: lineVat,
      lineTotal: packagingAmount,
    })
  }
  const codFee = order.codFeeAmount != null ? Number(order.codFeeAmount) : 0
  if (codFee > 0) {
    docLines.push({
      description: labels.codFeeLine,
      quantity: 1,
      unitPrice: codFee,
      vatPercent: lineVat,
      lineTotal: codFee,
    })
  }

  const viesCheck = order.viesCheck
  const vies =
    viesCheck || fullVatId
      ? {
          valid: viesCheck?.valid ?? null,
          vatId: fullVatId ?? formatEuVatId(viesCheck?.vatCountryCode, viesCheck?.vatNumber) ?? '',
          checkedAt: (viesCheck?.checkedAt ?? order.createdAt).toISOString().slice(0, 19),
          consultationNumber: viesCheck?.requestIdentifier ?? null,
          registeredName: viesCheck?.registeredName ?? null,
        }
      : null

  const title = input.orderPdfTitle?.trim() || labels.title

  const bankSection =
    isBankTransfer(order.paymentMethod) && bank.iban
      ? {
          title: labels.paymentDetails,
          rows: [
            bank.organizationName
              ? { label: labels.recipient, value: bank.organizationName }
              : null,
            bank.iban ? { label: 'IBAN', value: bank.iban } : null,
            bank.bic ? { label: 'BIC / SWIFT', value: bank.bic } : null,
            bank.bankName ? { label: labels.bank, value: bank.bankName } : null,
          ].filter(Boolean) as Array<{ label: string; value: string }>,
          purpose: (input.paymentPurposeTemplate ?? 'Order {orderNumber}')
            .replace(/\{orderNumber\}/g, formatOrderNumberDisplay(order.orderNumber))
            .replace(/\{orderNumbers\}/g, formatOrderNumberDisplay(order.orderNumber)),
        }
      : null

  return {
    region,
    locale: pdfLocale,
    title,
    orderNumber: formatOrderNumberDisplay(order.orderNumber),
    orderDate: localeDate,
    currency: order.currency,
    seller: { name: bank.organizationName || 'Green Angels', lines: sellerLines },
    buyer: { name: buyerName, lines: buyerLines },
    shipTo: { name: shipToName, lines: shipLines },
    deliveryLabel,
    paymentLabel,
    lines: docLines,
    productsSubtotal:
      order.productsSubtotal != null ? Number(order.productsSubtotal) : Number(order.totalAmount),
    deliveryAmount,
    packagingAmount,
    codFeeAmount: codFee,
    taxAmount: order.taxAmount != null ? Number(order.taxAmount) : 0,
    taxRatePercent: order.taxRatePercent,
    taxIncluded: order.taxRegime !== 'reverse_charge' && Number(order.taxAmount ?? 0) > 0,
    grandTotal: Number(order.totalAmount),
    taxRegime: order.taxRegime,
    vies: vies?.vatId ? vies : null,
    bankSection,
    footerNotes: labels.footer,
  }
}
