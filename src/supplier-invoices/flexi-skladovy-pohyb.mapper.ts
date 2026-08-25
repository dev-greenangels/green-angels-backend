import { randomUUID } from 'crypto'

import { flexiIsoDate, toFlexiRelationCode } from '../flexi/flexi-order-export-mapping'
import type { CreateWarehouseDocumentDto } from './dto/supplier-invoice.dto'

export type WarehouseVoucherType = 'STANDARD' | 'VYROBA' | 'PREVODKA'
export type WarehouseMovement = 'prijem' | 'vydej'

export function buildSkladovyPohybDocument(input: {
  dto: CreateWarehouseDocumentDto
  noStockCenikKods?: string[]
  externalId?: string
}): { document: Record<string, unknown>; externalId: string; needsPrevodkaComplete: boolean } {
  const extId = input.externalId ?? `ext:GA:wh:${randomUUID()}`
  const voucher = input.dto.voucherType
  const movement = input.dto.movement
  const noStock = new Set(
    (input.noStockCenikKods ?? []).map((k) => k.trim().toUpperCase()).filter(Boolean),
  )

  const isPrevodka = voucher === 'PREVODKA'
  const typPohybuK = movement === 'prijem' ? 'typPohybu.prijem' : 'typPohybu.vydej'

  let typPohybuSkladK: string
  if (isPrevodka) {
    typPohybuSkladK = 'typPohybuSklad.vydejPrevod'
  } else if (voucher === 'VYROBA') {
    typPohybuSkladK =
      movement === 'prijem' ? 'typPohybuSklad.prijemHoly' : 'typPohybuSklad.vydejHoly'
  } else {
    // STANDARD: naked movement — no invoice link
    typPohybuSkladK =
      movement === 'prijem' ? 'typPohybuSklad.prijemHoly' : 'typPohybuSklad.vydejHoly'
  }

  const typDoklCode =
    voucher === 'VYROBA' ? 'VÝROBA' : voucher === 'PREVODKA' ? 'PŘEVODKA' : 'STANDARD'

  const defaultStock = input.dto.stockCode?.trim() || ''

  const skladovePolozky = input.dto.lines
    .filter((line) => line.abraCode.trim() && line.quantity > 0)
    .map((line) => {
      const abraCode = line.abraCode.trim()
      const lineStock = (line.stockCode?.trim() || defaultStock).trim()
      const row: Record<string, unknown> = {
        cenik: `code:${abraCode}`,
        mnozMj: line.quantity,
        typPolozkyK: 'typPolozky.katalog',
      }
      const isNonStock = noStock.has(abraCode.toUpperCase())
      if (!isNonStock && lineStock) {
        row.sklad = toFlexiRelationCode(lineStock)
      }
      const batch = line.batchNumber?.trim()
      if (batch && !isNonStock) {
        row.sarze = batch
      }
      if (line.unitPrice != null && Number.isFinite(line.unitPrice) && line.unitPrice > 0) {
        row.cenaMj = line.unitPrice
      }
      return row
    })

  const document: Record<string, unknown> = {
    id: extId,
    typDokl: toFlexiRelationCode(typDoklCode),
    typPohybuK,
    typPohybuSkladK,
    datVyst: flexiIsoDate(new Date(input.dto.issueDate)),
    skladovePolozky,
  }

  if (defaultStock) {
    document.sklad = toFlexiRelationCode(defaultStock)
  }

  if (isPrevodka) {
    document.typPohybuK = 'typPohybu.vydej'
    document.typPohybuSkladK = 'typPohybuSklad.vydejPrevod'
    const target = input.dto.targetStockCode?.trim()
    if (target) {
      document.skladCil = toFlexiRelationCode(target)
    }
  }

  const note = input.dto.note?.trim()
  if (note) {
    document.poznam = note
  }

  return {
    document,
    externalId: extId,
    needsPrevodkaComplete: isPrevodka,
  }
}
