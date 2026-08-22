import { existsSync } from 'fs'
import { join } from 'path'
import PDFDocument from 'pdfkit'

import {
  getOrderPdfLabels,
  pdfIntlLocale,
  resolveOrderPdfLocale,
  type OrderPdfLocale,
} from '../orders/order-pdf-labels'

export type OrderDocumentParty = {
  name: string
  lines: string[]
}

export type OrderDocumentLine = {
  description: string
  quantity: number
  unitPrice: number
  vatPercent: number
  lineTotal: number
}

export type OrderDocumentVies = {
  valid: boolean | null
  vatId: string
  checkedAt: string
  consultationNumber?: string | null
  registeredName?: string | null
}

export type OrderDocumentPdfInput = {
  region: 'ua' | 'sk'
  /** UI locale for PDF strings (uk|en|sk|hu|de|cs). */
  locale?: string
  title?: string
  orderNumber: string
  orderDate: string
  currency: string
  seller: OrderDocumentParty
  buyer: OrderDocumentParty
  shipTo?: OrderDocumentParty | null
  deliveryLabel: string
  paymentLabel: string
  lines: OrderDocumentLine[]
  productsSubtotal: number
  deliveryAmount: number
  packagingAmount: number
  codFeeAmount: number
  taxAmount: number
  taxRatePercent: number | null
  taxIncluded: boolean
  grandTotal: number
  taxRegime?: string | null
  vies?: OrderDocumentVies | null
  bankSection?: {
    title: string
    rows: Array<{ label: string; value: string }>
    purpose?: string
  } | null
  footerNotes?: string[]
}

const BRAND_GREEN = '#2D5016'
const MUTED = '#555555'
const BORDER = '#CCCCCC'

function resolveDejaVuPath(file: string): string | null {
  const candidates = [
    join(__dirname, '..', '..', 'assets', 'fonts', file),
    join(process.cwd(), 'assets', 'fonts', file),
    join(process.cwd(), 'green-angels-backend', 'assets', 'fonts', file),
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

function resolveLogoPath(region: 'ua' | 'sk'): string | null {
  const file = region === 'sk' ? 'logo-sk.png' : 'logo-ua.png'
  const candidates = [
    process.env.ORDER_PDF_LOGO_PATH?.trim() || '',
    join(__dirname, '..', '..', 'assets', 'branding', file),
    join(process.cwd(), 'assets', 'branding', file),
    join(process.cwd(), 'green-angels-backend', 'assets', 'branding', file),
    join(__dirname, '..', '..', 'assets', 'watermarks', `${region}.png`),
    join(process.cwd(), 'assets', 'watermarks', `${region}.png`),
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p)) ?? null
}

function money(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

function ensurePage(doc: PDFKit.PDFDocument, y: number, needed: number, margin: number): number {
  if (y + needed <= doc.page.height - margin) return y
  doc.addPage()
  return margin
}

function drawPartyBlock(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  heading: string,
  party: OrderDocumentParty,
  fonts: { regular: string; bold: string },
) {
  doc.font(fonts.bold).fontSize(9).fillColor(MUTED).text(heading, x, y, { width })
  let cursor = y + 12
  doc.font(fonts.bold).fontSize(10).fillColor('#000000').text(party.name, x, cursor, { width })
  cursor += doc.heightOfString(party.name, { width }) + 2
  doc.font(fonts.regular).fontSize(9).fillColor('#222222')
  for (const line of party.lines) {
    if (!line.trim()) continue
    doc.text(line, x, cursor, { width })
    cursor += doc.heightOfString(line, { width }) + 2
  }
  return cursor + 4
}

export async function buildOrderDocumentPdf(input: OrderDocumentPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 42
    const doc = new PDFDocument({ margin, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const regularPath = resolveDejaVuPath('DejaVuSans.ttf')
    const boldPath = resolveDejaVuPath('DejaVuSans-Bold.ttf')
    const regular = regularPath ? 'DejaVu' : 'Helvetica'
    const bold = boldPath ? 'DejaVu-Bold' : 'Helvetica-Bold'
    if (regularPath) {
      doc.registerFont('DejaVu', regularPath)
      doc.registerFont('DejaVu-Bold', boldPath ?? regularPath)
    }

    const pdfLocale: OrderPdfLocale = input.locale
      ? resolveOrderPdfLocale(input.locale)
      : input.region === 'sk'
        ? 'sk'
        : 'uk'
    const labels = getOrderPdfLabels(pdfLocale)
    const intlLocale = pdfIntlLocale(pdfLocale)
    const pageWidth = doc.page.width - margin * 2
    const colGap = 16
    const colWidth = (pageWidth - colGap) / 2

    // Logo + title band
    const logoPath = resolveLogoPath(input.region)
    let y = margin
    if (logoPath) {
      try {
        const logoW = 140
        const logoH = 40
        doc.image(logoPath, margin, y, { fit: [logoW, logoH] })
        y += logoH + 10
      } catch {
        // Soft-degrade: continue without logo
      }
    }

    const title = input.title?.trim() || labels.title
    doc.rect(margin, y, pageWidth, 28).fill(BRAND_GREEN)
    doc.font(bold).fontSize(13).fillColor('#FFFFFF').text(title, margin + 10, y + 7, {
      width: pageWidth - 20,
    })
    y += 38

    doc.font(regular).fontSize(10).fillColor('#111111')
    doc.text(`${labels.order}: ${input.orderNumber}`, margin, y)
    doc.text(`${labels.date}: ${input.orderDate}`, margin + colWidth + colGap, y, {
      width: colWidth,
      align: 'right',
    })
    y += 18

    const sellerBottom = drawPartyBlock(
      doc,
      margin,
      y,
      colWidth,
      labels.supplier,
      input.seller,
      { regular, bold },
    )
    const buyerBottom = drawPartyBlock(
      doc,
      margin + colWidth + colGap,
      y,
      colWidth,
      labels.buyer,
      input.buyer,
      { regular, bold },
    )
    y = Math.max(sellerBottom, buyerBottom) + 2

    doc.font(regular).fontSize(9).fillColor(MUTED)
    const metaLines = [
      `${labels.delivery}: ${input.deliveryLabel}`,
      `${labels.payment}: ${input.paymentLabel}`,
      input.currency ? `${labels.currency}: ${input.currency}` : '',
    ].filter(Boolean)
    for (const line of metaLines) {
      doc.text(line, margin, y, { width: pageWidth })
      y += 12
    }
    y += 4

    if (input.shipTo) {
      y = drawPartyBlock(doc, margin, y, pageWidth, labels.shipTo, input.shipTo, {
        regular,
        bold,
      })
    }

    // Table header
    y = ensurePage(doc, y, 60, margin)
    const tableTop = y
    const descW = pageWidth * 0.42
    const qtyW = pageWidth * 0.1
    const priceW = pageWidth * 0.14
    const vatW = pageWidth * 0.1
    const amountW = pageWidth - descW - qtyW - priceW - vatW

    doc.rect(margin, tableTop, pageWidth, 18).fill('#F3F4F0')
    doc.font(bold).fontSize(8).fillColor('#333333')
    let hx = margin + 4
    doc.text(labels.colDescription, hx, tableTop + 5, { width: descW - 8 })
    hx += descW
    doc.text(labels.colQty, hx, tableTop + 5, { width: qtyW - 4, align: 'right' })
    hx += qtyW
    doc.text(labels.colPrice, hx, tableTop + 5, { width: priceW - 4, align: 'right' })
    hx += priceW
    doc.text(labels.colVat, hx, tableTop + 5, { width: vatW - 4, align: 'right' })
    hx += vatW
    doc.text(labels.colAmount, hx, tableTop + 5, { width: amountW - 8, align: 'right' })

    y = tableTop + 20
    doc.font(regular).fontSize(8.5).fillColor('#111111')

    for (const line of input.lines) {
      const rowHeight = Math.max(
        16,
        doc.heightOfString(line.description, { width: descW - 8 }) + 8,
      )
      y = ensurePage(doc, y, rowHeight + 4, margin)
      doc.moveTo(margin, y).lineTo(margin + pageWidth, y).strokeColor(BORDER).lineWidth(0.5).stroke()

      let cx = margin + 4
      doc.text(line.description, cx, y + 4, { width: descW - 8 })
      cx += descW
      doc.text(String(line.quantity), cx, y + 4, { width: qtyW - 4, align: 'right' })
      cx += qtyW
      doc.text(money(line.unitPrice, input.currency, intlLocale), cx, y + 4, {
        width: priceW - 4,
        align: 'right',
      })
      cx += priceW
      doc.text(`${line.vatPercent.toFixed(0)}`, cx, y + 4, { width: vatW - 4, align: 'right' })
      cx += vatW
      doc.text(money(line.lineTotal, input.currency, intlLocale), cx, y + 4, {
        width: amountW - 8,
        align: 'right',
      })
      y += rowHeight
    }

    doc.moveTo(margin, y).lineTo(margin + pageWidth, y).strokeColor(BORDER).lineWidth(0.5).stroke()
    y += 12

    const totalsX = margin + pageWidth * 0.5
    const totalsW = pageWidth * 0.5
    const labelW = totalsW * 0.58
    const valueW = totalsW * 0.42
    const addTotalRow = (label: string, value: string, boldRow = false) => {
      const fontSize = boldRow ? 11 : 9
      doc.font(boldRow ? bold : regular).fontSize(fontSize).fillColor('#111111')
      const labelHeight = doc.heightOfString(label, { width: labelW })
      const valueHeight = doc.heightOfString(value, { width: valueW, align: 'right' })
      const rowH = Math.max(labelHeight, valueHeight, boldRow ? 14 : 12) + 4
      y = ensurePage(doc, y, rowH + 2, margin)
      doc.text(label, totalsX, y, { width: labelW })
      doc.text(value, totalsX + labelW, y, { width: valueW, align: 'right' })
      y += rowH
    }

    addTotalRow(labels.products, money(input.productsSubtotal, input.currency, intlLocale))
    if (input.deliveryAmount > 0) {
      addTotalRow(labels.shipping, money(input.deliveryAmount, input.currency, intlLocale))
    }
    if (input.packagingAmount > 0) {
      addTotalRow(labels.packaging, money(input.packagingAmount, input.currency, intlLocale))
    }
    if (input.codFeeAmount > 0) {
      addTotalRow(labels.codFee, money(input.codFeeAmount, input.currency, intlLocale))
    }

    const vatRate = input.taxRatePercent ?? 0
    if (input.taxRegime === 'reverse_charge') {
      addTotalRow(labels.vat, '0 % — reverse charge', false)
    } else if (input.taxAmount > 0) {
      addTotalRow(
        input.taxIncluded ? labels.vatIncluded : labels.vat,
        money(input.taxAmount, input.currency, intlLocale),
      )
    } else if (vatRate > 0) {
      addTotalRow(labels.vat, `${vatRate.toFixed(0)} %`, false)
    }

    addTotalRow(labels.total, money(input.grandTotal, input.currency, intlLocale), true)

    if (input.taxRegime === 'reverse_charge') {
      y = ensurePage(doc, y, 40, margin)
      doc.rect(margin, y, pageWidth, 36).strokeColor(BRAND_GREEN).lineWidth(1).stroke()
      doc.font(bold).fontSize(8.5).fillColor(BRAND_GREEN).text(labels.reverseChargeTitle, margin + 8, y + 8, {
        width: pageWidth - 16,
      })
      doc.font(regular).fontSize(8).fillColor('#333333').text(labels.reverseChargeBody, margin + 8, y + 22, {
        width: pageWidth - 16,
      })
      y += 44
    }

    if (input.vies?.vatId) {
      y = ensurePage(doc, y, 30, margin)
      const viesLines = [
        `VIES IČ DPH: ${input.vies.vatId}`,
        input.vies.valid === true
          ? labels.viesValid
          : input.vies.valid === false
            ? labels.viesInvalid
            : labels.viesUnavailable,
        `${labels.viesChecked}: ${input.vies.checkedAt}`,
      ]
      if (input.vies.consultationNumber) {
        viesLines.push(`VIES consultation: ${input.vies.consultationNumber}`)
      }
      if (input.vies.registeredName) {
        viesLines.push(`${labels.viesRegistryName}: ${input.vies.registeredName}`)
      }
      doc.font(regular).fontSize(8).fillColor(MUTED)
      for (const line of viesLines) {
        doc.text(line, margin, y, { width: pageWidth })
        y += 11
      }
      y += 4
    }

    if (input.bankSection) {
      y = ensurePage(doc, y, 50, margin)
      doc.font(bold).fontSize(10).fillColor('#111111').text(input.bankSection.title, margin, y)
      y += 14
      doc.font(regular).fontSize(9)
      for (const row of input.bankSection.rows) {
        y = ensurePage(doc, y, 12, margin)
        doc.text(`${row.label}: ${row.value}`, margin, y, { width: pageWidth })
        y += 12
      }
      if (input.bankSection.purpose) {
        y += 2
        doc.font(bold).text(`${labels.paymentPurpose}: ${input.bankSection.purpose}`, margin, y, {
          width: pageWidth,
        })
        y += 14
      }
    }

    const footerNotes = input.footerNotes?.length ? input.footerNotes : labels.footer
    if (footerNotes.length) {
      y = ensurePage(doc, y, 20, margin)
      doc.font(regular).fontSize(7.5).fillColor(MUTED)
      for (const note of footerNotes) {
        doc.text(note, margin, y, { width: pageWidth })
        y += doc.heightOfString(note, { width: pageWidth }) + 3
      }
    }

    doc.end()
  })
}

/** @deprecated Use buildOrderDocumentPdf — kept for gradual migration. */
export type OrderConfirmationPdfInput = OrderDocumentPdfInput

export async function buildOrderConfirmationPdf(input: OrderDocumentPdfInput): Promise<Buffer> {
  return buildOrderDocumentPdf(input)
}
