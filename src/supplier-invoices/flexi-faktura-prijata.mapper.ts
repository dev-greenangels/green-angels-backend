import { randomUUID } from 'crypto'

import { flexiIsoDate, toFlexiRelationCode } from '../flexi/flexi-order-export-mapping'
import type { FlexiSettings } from '../flexi/flexi.types'
import type { CreateInvoiceLineDto, CreateSupplierInvoiceDto } from './dto/supplier-invoice.dto'
import { resolveInvoiceLineAmounts } from './invoice-line-pricing'

/** Flexi requires datSplat; fall back to tax/issue date when due date missing on PDF. */
export function resolveDueDate(dto: Pick<CreateSupplierInvoiceDto, 'dueDate' | 'taxDate' | 'issueDate'>): string {
  const due = dto.dueDate?.trim()
  if (due) return due.slice(0, 10)
  const tax = dto.taxDate?.trim()
  if (tax) return tax.slice(0, 10)
  return dto.issueDate.trim().slice(0, 10)
}

export function defaultVariableSymbol(invoiceNumber: string): string {
  const digits = invoiceNumber.replace(/\D/g, '').slice(0, 20)
  return digits || invoiceNumber.trim().slice(0, 20)
}

export function buildFakturaPrijataDocument(input: {
  dto: CreateSupplierInvoiceDto
  firmaRef: string
  typDoklCode: string
  centerCode: string
  /** Cenik codes that are non-stock (neskladové) — never send sklad (BOXES, SHIPPING, …). */
  noStockCenikKods?: string[]
  externalId?: string
  notes?: string[]
}): Record<string, unknown> {
  const extId = input.externalId ?? `ext:GA:inv:${randomUUID()}`
  const priceTyp = input.dto.priceIncludesVat ? 'typCeny.sDph' : 'typCeny.bezDph'
  const noStock = new Set(
    (input.noStockCenikKods ?? [])
      .map((k) => k.trim().toUpperCase())
      .filter(Boolean),
  )

  const polozkyDokladu = input.dto.lines.map((line) => {
    const abraCode = line.abraCode.trim()
    const amounts = resolveInvoiceLineAmounts({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })
    const row: Record<string, unknown> = {
      cenik: `code:${abraCode}`,
      mnozMj: amounts.quantity,
      cenaMj: amounts.unitPrice,
      nazev: (line.displayName ?? line.rawName).trim(),
      typCenyDphK: priceTyp,
    }
    if (amounts.lineTotal > 0) {
      if (input.dto.priceIncludesVat) {
        row.sumCelkem = amounts.lineTotal
      } else {
        row.sumZkl = amounts.lineTotal
      }
    }
    const isNonStock = noStock.has(abraCode.toUpperCase())
    const lineStock =
      line.stockCode !== undefined
        ? line.stockCode.trim()
        : input.dto.targetStockCode.trim()
    if (!isNonStock && lineStock) {
      row.sklad = toFlexiRelationCode(lineStock)
    }
    if (line.vatRate != null && Number.isFinite(line.vatRate)) {
      row.szbDph = line.vatRate
    }
    const batch = line.batchNumber?.trim()
    if (batch && !isNonStock) {
      row.sarze = batch
    }
    return row
  })

  const varSym =
    input.dto.variableSymbol?.trim().slice(0, 20) ||
    defaultVariableSymbol(input.dto.invoiceNumber)

  const document: Record<string, unknown> = {
    id: extId,
    typDokl: toFlexiRelationCode(input.typDoklCode),
    datVyst: flexiIsoDate(new Date(input.dto.issueDate)),
    datSplat: flexiIsoDate(new Date(resolveDueDate(input.dto))),
    cisDosle: input.dto.invoiceNumber.trim(),
    varSym,
    firma: input.firmaRef,
    mena: toFlexiRelationCode(input.dto.currency.trim().toUpperCase()),
    polozkyDokladu,
  }

  const taxDate = input.dto.taxDate?.trim()
  if (taxDate) {
    document.datZdPln = flexiIsoDate(new Date(taxDate))
  }

  const orderRef = input.dto.orderReference?.trim()
  if (orderRef) {
    document.cisObj = orderRef
  }

  if (input.centerCode.trim()) {
    document.stredisko = toFlexiRelationCode(input.centerCode.trim())
  }
  if (input.notes?.length) {
    document.poznam = input.notes.join('\n')
  }

  return document
}

export function mapEditedLinesToCreateDto(
  meta: {
    invoiceNumber: string
    issueDate: string
    dueDate?: string
    taxDate?: string
    currency: string
    variableSymbol?: string
    orderReference?: string
    deliveryNoteNumber?: string
    supplierName: string
    supplierIco?: string
    supplierDic?: string
    supplierVatId?: string
    supplierAddress?: string
    targetStockCode: string
    priceIncludesVat: boolean
  },
  lines: CreateInvoiceLineDto[],
): CreateSupplierInvoiceDto {
  return {
    invoiceNumber: meta.invoiceNumber,
    issueDate: meta.issueDate,
    dueDate: meta.dueDate,
    taxDate: meta.taxDate,
    currency: meta.currency,
    variableSymbol: meta.variableSymbol,
    orderReference: meta.orderReference,
    deliveryNoteNumber: meta.deliveryNoteNumber,
    targetStockCode: meta.targetStockCode,
    priceIncludesVat: meta.priceIncludesVat,
    supplierName: meta.supplierName,
    supplierIco: meta.supplierIco,
    supplierDic: meta.supplierDic,
    supplierVatId: meta.supplierVatId,
    supplierAddress: meta.supplierAddress,
    lines,
  }
}

export function resolveReceivedInvoiceDocType(settings: FlexiSettings, envFallback: string): string {
  // Live typ-faktury-prijate: FAKTURA / ZÁLOHA / ZDD / DOBROPIS (not "FP").
  const fromSettings = settings.receivedInvoiceDocTypeCode?.trim()
  const fromEnv = envFallback.trim()
  return fromSettings || fromEnv || 'FAKTURA'
}
