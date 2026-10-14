import type {
  ReservationPreviewLineInput,
  ReservationPreviewLineResult,
  ReservationPreviewOp,
} from './plant-stock.types'

export type ExistingServiceReservation = {
  id: string
  firma: string
  cenik: string
  sklad: string
  mnozstvi: number
  polObch: string
}

function codeRef(value: string): string {
  const s = value.trim()
  if (s.startsWith('code:')) return s.slice(5).trim()
  return s
}

function sameCode(a: string, b: string): boolean {
  return codeRef(a).toUpperCase() === codeRef(b).toUpperCase()
}

/**
 * Pure preview of service-reservation sync (no ABRA writes).
 * Rules A–G from PlantStock SK product lock.
 */
export function previewReservationSync(input: {
  serviceCompanyCode: string
  skladKod: string
  lines: ReservationPreviewLineInput[]
  existing: ExistingServiceReservation[]
}): ReservationPreviewLineResult[] {
  const company = input.serviceCompanyCode.trim()
  const sklad = input.skladKod.trim()
  const results: ReservationPreviewLineResult[] = []

  for (const line of input.lines) {
    const sku = String(line.sku ?? '').trim()
    const currentQty = Number(line.currentQty)
    const freeQty = Number(line.freeQty)

    if (!sku || !sklad || !company) {
      results.push({
        sku,
        skladKod: sklad,
        currentQty,
        freeQty,
        desiredQty: NaN,
        oldQty: null,
        abraRezervaceId: null,
        operation: 'CONFLICT',
        reason: 'Missing sku, sklad, or service company.',
      })
      continue
    }

    if (!Number.isFinite(currentQty) || !Number.isFinite(freeQty) || currentQty < 0 || freeQty < 0) {
      results.push({
        sku,
        skladKod: sklad,
        currentQty,
        freeQty,
        desiredQty: NaN,
        oldQty: null,
        abraRezervaceId: null,
        operation: 'CONFLICT',
        reason: 'Invalid currentQty / freeQty.',
      })
      continue
    }

    const desiredQty = currentQty - freeQty
    if (desiredQty < 0) {
      results.push({
        sku,
        skladKod: sklad,
        currentQty,
        freeQty,
        desiredQty,
        oldQty: null,
        abraRezervaceId: null,
        operation: 'CONFLICT',
        reason: 'desiredReserveQty < 0 (freeQty > currentQty).',
      })
      continue
    }

    const matches = input.existing.filter(
      (r) =>
        sameCode(r.firma, company) &&
        sameCode(r.cenik, sku) &&
        sameCode(r.sklad, sklad) &&
        !String(r.polObch ?? '').trim(),
    )

    // Other-company rows for same sku+sklad are ignored for writes (rule E) —
    // preview only operates on service-company matches.

    if (matches.length > 1) {
      results.push({
        sku,
        skladKod: sklad,
        currentQty,
        freeQty,
        desiredQty,
        oldQty: null,
        abraRezervaceId: null,
        operation: 'CONFLICT',
        reason: 'Multiple service reservations for firma+sku+sklad.',
        matchingIds: matches.map((m) => m.id),
      })
      continue
    }

    const one = matches[0] ?? null
    const oldQty = one ? one.mnozstvi : null
    let operation: ReservationPreviewOp

    if (desiredQty === 0) {
      operation = one ? 'DELETE' : 'NOOP'
    } else if (!one) {
      operation = 'CREATE'
    } else if (Number(one.mnozstvi) === desiredQty) {
      operation = 'NOOP'
    } else {
      operation = 'UPDATE'
    }

    results.push({
      sku,
      skladKod: sklad,
      currentQty,
      freeQty,
      desiredQty,
      oldQty,
      abraRezervaceId: one?.id ?? null,
      operation,
    })
  }

  return results
}
