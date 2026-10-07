/**
 * Warehouse packing helpers.
 * Commercial packagingBoxCount is an immutable checkout snapshot — not actual cartons.
 * Completion is Order.packingCompletedAt (not Order.status=PACKED).
 */

export type PackingPhase = 'not_started' | 'in_progress' | 'completed'

/** Persist checkout packaging counts on Order create (null when zero). */
export function orderPackagingCountSnapshot(input: {
  packagingBoxCount: number
  packagingPalletCount: number
}): { packagingBoxCount: number | null; packagingPalletCount: number | null } {
  return {
    packagingBoxCount:
      input.packagingBoxCount > 0 ? input.packagingBoxCount : null,
    packagingPalletCount:
      input.packagingPalletCount > 0 ? input.packagingPalletCount : null,
  }
}

export function resolvePackingPhase(input: {
  packingCompletedAt: Date | string | null | undefined
  actualPackageCount: number
}): PackingPhase {
  if (input.packingCompletedAt) return 'completed'
  if (input.actualPackageCount > 0) return 'in_progress'
  return 'not_started'
}

/**
 * Actual − estimated boxes. Only meaningful when packing is completed.
 * Estimated null/undefined treated as 0 for the delta.
 */
export function packingBoxDifference(
  actualPackageCount: number,
  estimatedBoxCount: number | null | undefined,
): number {
  const estimated =
    estimatedBoxCount != null && Number.isFinite(estimatedBoxCount)
      ? estimatedBoxCount
      : 0
  return actualPackageCount - estimated
}

/** Internal warehouse package code — not a carrier TTN. */
export function buildOrderPackageCode(orderNumber: number, sequence: number): string {
  const seq = Math.max(1, Math.floor(sequence))
  return `OPKG-${orderNumber}-${seq}`
}

export type OrderPackingSummary = {
  phase: PackingPhase
  estimatedBoxCount: number | null
  estimatedPalletCount: number | null
  packagingAmount: number | null
  actualPackageCount: number
  /** Present only when phase === 'completed'. */
  boxDifference: number | null
  packingCompletedAt: string | null
}

export function buildOrderPackingSummary(input: {
  packagingBoxCount: number | null | undefined
  packagingPalletCount: number | null | undefined
  packagingAmount: number | null | undefined
  packingCompletedAt: Date | string | null | undefined
  actualPackageCount: number
}): OrderPackingSummary {
  const phase = resolvePackingPhase({
    packingCompletedAt: input.packingCompletedAt,
    actualPackageCount: input.actualPackageCount,
  })
  const completedAt =
    input.packingCompletedAt instanceof Date
      ? input.packingCompletedAt.toISOString()
      : input.packingCompletedAt
        ? String(input.packingCompletedAt)
        : null

  return {
    phase,
    estimatedBoxCount: input.packagingBoxCount ?? null,
    estimatedPalletCount: input.packagingPalletCount ?? null,
    packagingAmount:
      input.packagingAmount != null && Number.isFinite(Number(input.packagingAmount))
        ? Number(input.packagingAmount)
        : null,
    actualPackageCount: input.actualPackageCount,
    boxDifference:
      phase === 'completed'
        ? packingBoxDifference(input.actualPackageCount, input.packagingBoxCount)
        : null,
    packingCompletedAt: completedAt,
  }
}
