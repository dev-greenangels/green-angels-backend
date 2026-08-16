import { existsSync } from 'fs'
import { join } from 'path'
import PDFDocument from 'pdfkit'

export type OrderConfirmationPdfInput = {
  orderNumber: string
  customerName: string
  customerEmail?: string | null
  currency: string
  items: Array<{ name: string; quantity: number; lineTotal: number }>
  productsSubtotal: number
  taxAmount: number
  taxIncluded: boolean
  deliveryAmount: number
  packagingAmount: number
  codFeeAmount: number
  grandTotal: number
  companyLines?: string[]
  title?: string
}

function resolveDejaVuPath(file: string): string | null {
  const candidates = [
    join(__dirname, '..', '..', 'assets', 'fonts', file),
    join(process.cwd(), 'assets', 'fonts', file),
    join(process.cwd(), 'green-angels-backend', 'assets', 'fonts', file),
  ]
  return candidates.find((p) => existsSync(p)) ?? null
}

export async function buildOrderConfirmationPdf(
  input: OrderConfirmationPdfInput,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const regular = resolveDejaVuPath('DejaVuSans.ttf')
    const bold = resolveDejaVuPath('DejaVuSans-Bold.ttf')
    if (regular) {
      doc.registerFont('DejaVu', regular)
      doc.registerFont('DejaVu-Bold', bold ?? regular)
      doc.font('DejaVu')
    }

    const title = input.title?.trim() || 'Order confirmation / Potvrdenie objednávky'
    doc.fontSize(18).font(bold ? 'DejaVu-Bold' : 'Helvetica-Bold').text(title, { underline: true })
    doc.moveDown()
    doc.fontSize(12).font(regular ? 'DejaVu' : 'Helvetica')
    doc.text(`Order: ${input.orderNumber}`)
    doc.text(`Customer: ${input.customerName}`)
    if (input.customerEmail) doc.text(`Email: ${input.customerEmail}`)
    doc.moveDown()

    if (input.companyLines?.length) {
      for (const line of input.companyLines) doc.text(line)
      doc.moveDown()
    }

    doc.text('Items:')
    for (const item of input.items) {
      doc.text(
        `- ${item.name} × ${item.quantity} = ${item.lineTotal.toFixed(2)} ${input.currency}`,
      )
    }
    doc.moveDown()
    doc.text(`Products: ${input.productsSubtotal.toFixed(2)} ${input.currency}`)
    if (input.packagingAmount > 0) {
      doc.text(`Packaging: ${input.packagingAmount.toFixed(2)} ${input.currency}`)
    }
    if (input.deliveryAmount > 0) {
      doc.text(`Delivery: ${input.deliveryAmount.toFixed(2)} ${input.currency}`)
    }
    if (input.codFeeAmount > 0) {
      doc.text(`COD fee: ${input.codFeeAmount.toFixed(2)} ${input.currency}`)
    }
    if (input.taxAmount > 0) {
      const label = input.taxIncluded ? 'VAT included' : 'VAT'
      doc.text(`${label}: ${input.taxAmount.toFixed(2)} ${input.currency}`)
      if (input.taxIncluded) {
        doc.text(
          `Without VAT: ${(input.productsSubtotal - input.taxAmount).toFixed(2)} ${input.currency}`,
        )
      }
    }
    doc.moveDown()
    doc.fontSize(14).font(bold ? 'DejaVu-Bold' : 'Helvetica-Bold')
    doc.text(`Total: ${input.grandTotal.toFixed(2)} ${input.currency}`)
    doc.end()
  })
}
