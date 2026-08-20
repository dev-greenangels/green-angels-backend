import { existsSync } from 'fs'
import { join } from 'path'
import PDFDocument from 'pdfkit'

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
  title: string
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

    const locale = input.region === 'sk' ? 'sk-SK' : 'uk-UA'
    const pageWidth = doc.page.width - margin * 2
    const colGap = 16
    const colWidth = (pageWidth - colGap) / 2

    // Title band
    doc.rect(margin, margin, pageWidth, 28).fill(BRAND_GREEN)
    doc.font(bold).fontSize(14).fillColor('#FFFFFF').text(input.title, margin + 10, margin + 7, {
      width: pageWidth - 20,
    })

    let y = margin + 38
    doc.font(regular).fontSize(9).fillColor(MUTED)
    doc.text(
      `${input.region === 'sk' ? 'Objednávka / Order' : 'Замовлення'}: ${input.orderNumber}`,
      margin,
      y,
    )
    doc.text(
      `${input.region === 'sk' ? 'Dátum' : 'Дата'}: ${input.orderDate}`,
      margin + colWidth + colGap,
      y,
      { width: colWidth, align: 'right' },
    )
    y += 18

    const sellerBottom = drawPartyBlock(
      doc,
      margin,
      y,
      colWidth,
      input.region === 'sk' ? 'DODÁVATEĽ / SUPPLIER' : 'ПРОДАВЕЦЬ',
      input.seller,
      { regular, bold },
    )
    const metaLines = [
      `${input.region === 'sk' ? 'Doprava' : 'Доставка'}: ${input.deliveryLabel}`,
      `${input.region === 'sk' ? 'Platba' : 'Оплата'}: ${input.paymentLabel}`,
      input.currency ? `${input.region === 'sk' ? 'Mena' : 'Валюта'}: ${input.currency}` : '',
    ].filter(Boolean)
    const buyerBottom = drawPartyBlock(
      doc,
      margin + colWidth + colGap,
      y,
      colWidth,
      input.region === 'sk' ? 'ODBERATEĽ / BUYER' : 'ПОКУПЕЦЬ',
      input.buyer,
      { regular, bold },
    )
    y = Math.max(sellerBottom, buyerBottom) + 6

    if (input.shipTo) {
      y = drawPartyBlock(
        doc,
        margin,
        y,
        pageWidth,
        input.region === 'sk' ? 'DODACIA ADRESA / SHIP TO' : 'АДРЕСА ДОСТАВКИ',
        input.shipTo,
        { regular, bold },
      )
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
    doc.text(input.region === 'sk' ? 'Popis' : 'Опис', hx, tableTop + 5, { width: descW - 8 })
    hx += descW
    doc.text(input.region === 'sk' ? 'Množ.' : 'К-сть', hx, tableTop + 5, { width: qtyW - 4, align: 'right' })
    hx += qtyW
    doc.text(input.region === 'sk' ? 'Cena' : 'Ціна', hx, tableTop + 5, { width: priceW - 4, align: 'right' })
    hx += priceW
    doc.text('DPH %', hx, tableTop + 5, { width: vatW - 4, align: 'right' })
    hx += vatW
    doc.text(input.region === 'sk' ? 'Suma' : 'Сума', hx, tableTop + 5, { width: amountW - 8, align: 'right' })

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
      doc.text(money(line.unitPrice, input.currency, locale), cx, y + 4, {
        width: priceW - 4,
        align: 'right',
      })
      cx += priceW
      doc.text(`${line.vatPercent.toFixed(0)}`, cx, y + 4, { width: vatW - 4, align: 'right' })
      cx += vatW
      doc.text(money(line.lineTotal, input.currency, locale), cx, y + 4, {
        width: amountW - 8,
        align: 'right',
      })
      y += rowHeight
    }

    doc.moveTo(margin, y).lineTo(margin + pageWidth, y).strokeColor(BORDER).lineWidth(0.5).stroke()
    y += 10

    const totalsX = margin + pageWidth * 0.55
    const totalsW = pageWidth * 0.45
    const addTotalRow = (label: string, value: string, boldRow = false) => {
      y = ensurePage(doc, y, 14, margin)
      doc.font(boldRow ? bold : regular).fontSize(boldRow ? 11 : 9).fillColor('#111111')
      doc.text(label, totalsX, y, { width: totalsW * 0.55 })
      doc.text(value, totalsX + totalsW * 0.55, y, { width: totalsW * 0.45, align: 'right' })
      y += boldRow ? 16 : 13
    }

    addTotalRow(
      input.region === 'sk' ? 'Tovar / Products' : 'Товари',
      money(input.productsSubtotal, input.currency, locale),
    )
    if (input.deliveryAmount > 0) {
      addTotalRow(
        input.region === 'sk' ? 'Doprava' : 'Доставка',
        money(input.deliveryAmount, input.currency, locale),
      )
    }
    if (input.packagingAmount > 0) {
      addTotalRow(
        input.region === 'sk' ? 'Balenie' : 'Пакування',
        money(input.packagingAmount, input.currency, locale),
      )
    }
    if (input.codFeeAmount > 0) {
      addTotalRow(
        input.region === 'sk' ? 'Dobierka' : 'Післяплата',
        money(input.codFeeAmount, input.currency, locale),
      )
    }

    const vatRate = input.taxRatePercent ?? 0
    if (input.taxRegime === 'reverse_charge') {
      addTotalRow('DPH / VAT', '0 % — reverse charge', false)
    } else if (input.taxAmount > 0) {
      addTotalRow(
        input.taxIncluded
          ? input.region === 'sk'
            ? 'DPH zahrnutá / VAT included'
            : 'ПДВ включено'
          : 'DPH / VAT',
        money(input.taxAmount, input.currency, locale),
      )
    } else if (vatRate > 0) {
      addTotalRow('DPH / VAT', `${vatRate.toFixed(0)} %`, false)
    }

    addTotalRow(
      input.region === 'sk' ? 'SPOLU / TOTAL' : 'РАЗОМ',
      money(input.grandTotal, input.currency, locale),
      true,
    )

    // VAT summary box for reverse charge / B2B
    if (input.taxRegime === 'reverse_charge') {
      y = ensurePage(doc, y, 40, margin)
      doc.rect(margin, y, pageWidth, 36).strokeColor(BRAND_GREEN).lineWidth(1).stroke()
      doc.font(bold).fontSize(8.5).fillColor(BRAND_GREEN).text(
        input.region === 'sk'
          ? 'Prenesenie daňovej povinnosti / Intra-Community supply — DPH 0 %'
          : 'Reverse charge — 0% VAT',
        margin + 8,
        y + 8,
        { width: pageWidth - 16 },
      )
      doc.font(regular).fontSize(8).fillColor('#333333').text(
        input.region === 'sk'
          ? 'Daň odvedie odberateľ podľa platných predpisov EÚ / VAT to be accounted for by the recipient.'
          : 'VAT to be accounted for by the recipient under applicable EU rules.',
        margin + 8,
        y + 22,
        { width: pageWidth - 16 },
      )
      y += 44
    }

    if (input.vies?.vatId) {
      y = ensurePage(doc, y, 30, margin)
      const viesLines = [
        `VIES IČ DPH: ${input.vies.vatId}`,
        input.vies.valid === true
          ? input.region === 'sk'
            ? 'VIES: platné / valid'
            : 'VIES: дійсний'
          : input.vies.valid === false
            ? input.region === 'sk'
              ? 'VIES: neplatné / invalid'
              : 'VIES: недійсний'
            : input.region === 'sk'
              ? 'VIES: nedostupné / unavailable'
              : 'VIES: недоступний',
        `${input.region === 'sk' ? 'Overené' : 'Перевірено'}: ${input.vies.checkedAt}`,
      ]
      if (input.vies.consultationNumber) {
        viesLines.push(`VIES consultation: ${input.vies.consultationNumber}`)
      }
      if (input.vies.registeredName) {
        viesLines.push(`${input.region === 'sk' ? 'Názov v registri' : 'Назва в реєстрі'}: ${input.vies.registeredName}`)
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
        doc.font(bold).text(
          `${input.region === 'sk' ? 'Variabilný symbol / účel' : 'Призначення платежу'}: ${input.bankSection.purpose}`,
          margin,
          y,
          { width: pageWidth },
        )
        y += 14
      }
    }

    if (input.footerNotes?.length) {
      y = ensurePage(doc, y, 20, margin)
      doc.font(regular).fontSize(7.5).fillColor(MUTED)
      for (const note of input.footerNotes) {
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
