import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from '@google/generative-ai'

import { assignInvoiceLineBatches } from './invoice-batch-assign'
import { resolveInvoiceLineAmounts } from './invoice-line-pricing'
import {
  DEFAULT_GEMINI_INVOICE_MODEL,
  GEMINI_INVOICE_MODELS,
} from './supplier-invoices.constants'
import type { GeminiParsedInvoice, SupplierInvoiceParseOptions } from './supplier-invoice.types'

const INVOICE_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    supplier: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING },
        ico: { type: SchemaType.STRING, nullable: true },
        dic: { type: SchemaType.STRING, nullable: true },
        vatId: { type: SchemaType.STRING, nullable: true },
        address: { type: SchemaType.STRING, nullable: true },
        city: { type: SchemaType.STRING, nullable: true },
        postalCode: { type: SchemaType.STRING, nullable: true },
        country: { type: SchemaType.STRING, nullable: true },
        email: { type: SchemaType.STRING, nullable: true },
        phone: { type: SchemaType.STRING, nullable: true },
        bankAccount: { type: SchemaType.STRING, nullable: true },
        iban: { type: SchemaType.STRING, nullable: true },
        swift: { type: SchemaType.STRING, nullable: true },
        bankName: { type: SchemaType.STRING, nullable: true },
      },
      required: ['name'],
    },
    invoice: {
      type: SchemaType.OBJECT,
      properties: {
        invoiceNumber: { type: SchemaType.STRING },
        deliveryNoteNumber: { type: SchemaType.STRING, nullable: true },
        orderReference: { type: SchemaType.STRING, nullable: true },
        issueDate: { type: SchemaType.STRING },
        dueDate: { type: SchemaType.STRING, nullable: true },
        taxDate: { type: SchemaType.STRING, nullable: true },
        currency: { type: SchemaType.STRING },
        paymentTerms: { type: SchemaType.STRING, nullable: true },
      },
      required: ['invoiceNumber', 'issueDate', 'currency'],
    },
    items: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          lineIndex: { type: SchemaType.INTEGER },
          rawName: { type: SchemaType.STRING },
          sku: { type: SchemaType.STRING, nullable: true },
          ean: { type: SchemaType.STRING, nullable: true },
          quantity: { type: SchemaType.NUMBER },
          unit: { type: SchemaType.STRING, nullable: true },
          unitPrice: { type: SchemaType.NUMBER },
          lineTotal: { type: SchemaType.NUMBER, nullable: true },
          vatRate: { type: SchemaType.NUMBER, nullable: true },
          batchNumber: { type: SchemaType.STRING, nullable: true },
          serialNumber: { type: SchemaType.STRING, nullable: true },
          countryOfOrigin: { type: SchemaType.STRING, nullable: true },
          hsCode: { type: SchemaType.STRING, nullable: true },
          notes: { type: SchemaType.STRING, nullable: true },
        },
        required: ['lineIndex', 'rawName', 'quantity', 'unitPrice'],
      },
    },
    totals: {
      type: SchemaType.OBJECT,
      properties: {
        subtotal: { type: SchemaType.NUMBER, nullable: true },
        vatAmount: { type: SchemaType.NUMBER, nullable: true },
        total: { type: SchemaType.NUMBER },
      },
      required: ['total'],
    },
    unmappedFields: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      nullable: true,
    },
  },
  required: ['supplier', 'invoice', 'items', 'totals'],
}

@Injectable()
export class GeminiInvoiceParserService {
  private readonly logger = new Logger(GeminiInvoiceParserService.name)

  constructor(private readonly config: ConfigService) {}

  async parsePdf(buffer: Buffer, options: SupplierInvoiceParseOptions): Promise<GeminiParsedInvoice> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY')?.trim()
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY не налаштовано.')
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const modelName = this.resolveModel(options.geminiModel)
    this.logger.log(`Parsing invoice PDF with model ${modelName}`)
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: INVOICE_RESPONSE_SCHEMA,
      },
    })

    const priceMode = options.priceIncludesVat
      ? 'unit prices INCLUDE VAT'
      : 'unit prices EXCLUDE VAT'

    const prompt = [
      'Extract ALL supplier invoice data from this PDF for ERP import (ABRA Flexi received invoice).',
      'Return strict JSON matching the schema. Extract every line item from every page — do not skip rows.',
      `Default container/size label when a line does not specify size: "${options.defaultSizeLabel}".`,
      'Plant pot sizes look like C2, P9, P11, C1.5. CUT products end with " - CUT".',
      `Prices: ${priceMode}. Amount / Amount EUR / Line total column → lineTotal (authoritative when printed).`,
      'Unit Price column → unitPrice only when no Amount is printed; we derive unitPrice = lineTotal / quantity.',
      'Dates as YYYY-MM-DD. Currency as ISO 4217 (EUR, CZK, UAH, PLN). Use comma→dot for decimals (e.g. 0,52 → 0.52).',
      '',
      'Header / supplier mapping (typical nursery invoices e.g. Vitroflora, FloraHolland):',
      '- Supplier block (seller): name, street → address, city, postalCode, country, tax/NIP/IČO → ico or vatId (keep country prefix for VAT e.g. PL5542684776).',
      '- Invoice no. / Invoice number → invoiceNumber (keep full string e.g. (S)FSE-246/07/2026/FEGP).',
      '- Invoice date → issueDate; Sale date / tax date → taxDate; Payment date / due date → dueDate.',
      '- Order no. / Order number / Customer order → orderReference; Delivery note / DN → deliveryNoteNumber.',
      '- Payment terms / Shipment terms → paymentTerms (combine into one string if both present).',
      '- Bank name, IBAN, SWIFT/BIC → bankName, iban, swift.',
      '',
      'Line table mapping:',
      '- Index / Art. / Item code / SKU → sku',
      '- CN / HS / TARIC / Customs code (column "CN", often 06029070) → hsCode — always extract when present',
      '- Description / Name → rawName = botanical/trade name ONLY',
      '  Do NOT put EU######, PP#####, patent/PBR registration numbers into rawName — put them into notes (e.g. "EU31589").',
      '  Do NOT invent registration numbers; only copy what is printed.',
      '- Quantity / Qty / pcs → quantity',
      '- Amount / Amount EUR / Line total → lineTotal (required when column exists on PDF)',
      '- Price / Unit price → unitPrice (secondary; may differ from Amount/qty on nursery invoices)',
      '- VAT % → vatRate; unit column / "per" → unit when meaningful',
      '- Discount %, VAT amount, country of origin → notes or dedicated fields when present',
      '- Vitroflora batch/order: footer "No. batch: …" → unmappedFields as "No. batch: …" (exact text).',
      '  Standalone 6-digit rows above product groups (699749, 701609) → separate item: rawName=number, quantity=0, no sku.',
      '  Product lines under a group inherit that batch (also set batchNumber when obvious).',
      '',
      'Totals: sum of Amount column → totals.total; subtotal and VAT amount when printed.',
      'Put buyer/ship-to, week no., shipped by, exchange rate, netto/gross weight, boxes, and any other leftover fields into unmappedFields as "key: value".',
      'lineIndex: 0-based order of lines on the invoice.',
    ].join('\n')

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: buffer.toString('base64'),
        },
      },
      { text: prompt },
    ])

    const text = result.response.text()?.trim()
    if (!text) {
      throw new Error('Gemini не повернув дані з PDF.')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      this.logger.warn(`Gemini JSON parse failed: ${text.slice(0, 300)}`)
      throw new Error('Gemini повернув некоректний JSON.')
    }

    return this.normalizeParsed(parsed)
  }

  private resolveModel(requested?: string): string {
    const fromRequest = requested?.trim()
    if (fromRequest && (GEMINI_INVOICE_MODELS as readonly string[]).includes(fromRequest)) {
      return fromRequest
    }
    const fromEnv = this.config.get<string>('GEMINI_MODEL')?.trim()
    if (fromEnv && (GEMINI_INVOICE_MODELS as readonly string[]).includes(fromEnv)) {
      return fromEnv
    }
    return DEFAULT_GEMINI_INVOICE_MODEL
  }

  private normalizeParsed(raw: unknown): GeminiParsedInvoice {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Gemini повернув порожній результат.')
    }
    const root = raw as Record<string, unknown>
    const supplier = root.supplier as Record<string, unknown> | undefined
    const invoice = root.invoice as Record<string, unknown> | undefined
    const items = Array.isArray(root.items) ? root.items : []
    const totals = root.totals as Record<string, unknown> | undefined

    if (!supplier?.name || !invoice?.invoiceNumber || !invoice?.issueDate || !invoice?.currency) {
      throw new Error('Gemini повернув неповні реквізити інвойсу.')
    }

    const unmappedFields = Array.isArray(root.unmappedFields)
      ? root.unmappedFields.map((v) => String(v))
      : undefined

    const mappedItems = items.map((row, index) => {
        const item = row as Record<string, unknown>
        const cleaned = cleanInvoicePlantName(String(item.rawName ?? '').trim())
        const noteParts = [optionalString(item.notes), ...cleaned.regs].filter(Boolean)
        const amounts = resolveInvoiceLineAmounts({
          quantity: Number(item.quantity) || 0,
          unitPrice: Number(item.unitPrice) || 0,
          lineTotal: optionalNumber(item.lineTotal),
        })
        return {
          lineIndex: Number.isFinite(Number(item.lineIndex)) ? Number(item.lineIndex) : index,
          rawName: cleaned.name,
          sku: optionalString(item.sku),
          ean: optionalString(item.ean),
          quantity: amounts.quantity,
          unit: optionalString(item.unit),
          unitPrice: amounts.unitPrice,
          lineTotal: amounts.lineTotal,
          vatRate: optionalNumber(item.vatRate),
          batchNumber: optionalString(item.batchNumber),
          serialNumber: optionalString(item.serialNumber),
          countryOfOrigin: optionalString(item.countryOfOrigin),
          hsCode: optionalString(item.hsCode),
          notes: noteParts.length ? noteParts.join('; ') : undefined,
        }
      })

    const itemsWithBatches = assignInvoiceLineBatches(mappedItems, unmappedFields).map(
      (line, index) => ({
        ...line,
        lineIndex: index,
      }),
    )

    return {
      supplier: {
        name: String(supplier.name).trim(),
        ico: optionalString(supplier.ico),
        dic: optionalString(supplier.dic),
        vatId: optionalString(supplier.vatId),
        address: optionalString(supplier.address),
        city: optionalString(supplier.city),
        postalCode: optionalString(supplier.postalCode),
        country: optionalString(supplier.country),
        email: optionalString(supplier.email),
        phone: optionalString(supplier.phone),
        bankAccount: optionalString(supplier.bankAccount),
        iban: optionalString(supplier.iban),
        swift: optionalString(supplier.swift),
        bankName: optionalString(supplier.bankName),
      },
      invoice: {
        invoiceNumber: String(invoice.invoiceNumber).trim(),
        deliveryNoteNumber: optionalString(invoice.deliveryNoteNumber),
        orderReference: optionalString(invoice.orderReference),
        issueDate: String(invoice.issueDate).trim().slice(0, 10),
        dueDate: optionalString(invoice.dueDate)?.slice(0, 10),
        taxDate: optionalString(invoice.taxDate)?.slice(0, 10),
        currency: String(invoice.currency).trim().toUpperCase(),
        paymentTerms: optionalString(invoice.paymentTerms),
      },
      items: itemsWithBatches,
      totals: {
        subtotal: optionalNumber(totals?.subtotal),
        vatAmount: optionalNumber(totals?.vatAmount),
        total: Number(totals?.total) || 0,
      },
      unmappedFields,
    }
  }
}

function optionalString(value: unknown): string | undefined {
  if (value == null) return undefined
  const trimmed = String(value).trim()
  return trimmed || undefined
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

/** Strip EU/PP registration noise from plant names (keep in regs → notes). */
function cleanInvoicePlantName(rawName: string): { name: string; regs: string[] } {
  const regs: string[] = []
  let name = rawName
    .replace(/\b((?:EU|PP)\d+)\b/gi, (_, token: string) => {
      regs.push(token.toUpperCase())
      return ' '
    })
    .replace(/[®™©]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return { name, regs }
}
