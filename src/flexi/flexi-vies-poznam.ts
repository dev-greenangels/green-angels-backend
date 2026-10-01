/**
 * Deterministic VIES operational note block for ABRA Flexi Received Order `poznam`.
 * Canonical English — internal staff wording (not locale-dependent ERP notes).
 */

export const GA_VIES_BLOCK_START = '[GA:VIES]'
export const GA_VIES_BLOCK_END = '[/GA:VIES]'

const MARKED_BLOCK_RE = /\[GA:VIES\][\s\S]*?\[\/GA:VIES\]/g

/** Legacy unmarked lines written by earlier exportOrder VIES notes. */
const LEGACY_VIES_LINE_RE =
  /^(VIES\s+(valid|invalid|unavailable)\s+@|Buyer VAT:|VIES consultation:|VIES name:)/i

export type FlexiViesPoznamStatus = 'VALID' | 'INVALID' | 'ERROR'

export type BuildViesPoznamBlockInput = {
  status: FlexiViesPoznamStatus
  buyerVatId?: string | null
  checkedAtIso: string
  requestIdentifier?: string | null
  registeredName?: string | null
  /** Order taxRegime at snapshot time — never mutated by retry. */
  taxRegime?: string | null
  /**
   * True when this note reflects a post-create Retry VIES result.
   * VALID after create must not imply historical tax changed.
   */
  verifiedAfterOrderCreation?: boolean
}

export function isVatAppliedTaxRegime(taxRegime: string | null | undefined): boolean {
  return (taxRegime ?? '').trim() !== 'reverse_charge'
}

export function stripLegacyViesLines(poznam: string): string {
  return poznam
    .split(/\r?\n/)
    .filter((line) => !LEGACY_VIES_LINE_RE.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function stripMarkedViesBlock(poznam: string): string {
  return poznam.replace(MARKED_BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** Count marked VIES blocks (for idempotency tests). */
export function countMarkedViesBlocks(poznam: string): number {
  const matches = poznam.match(MARKED_BLOCK_RE)
  return matches?.length ?? 0
}

/**
 * Upsert a single marked VIES block into `poznam`, preserving unrelated notes.
 * Removes prior marked blocks and safely identifiable legacy VIES lines.
 */
export function upsertViesPoznamBlock(
  existingPoznam: string | null | undefined,
  blockBody: string,
): string {
  const marked = `${GA_VIES_BLOCK_START}\n${blockBody.trim()}\n${GA_VIES_BLOCK_END}`
  let base = (existingPoznam ?? '').trim()
  base = stripMarkedViesBlock(base)
  base = stripLegacyViesLines(base)
  if (!base) return marked
  return `${base}\n\n${marked}`
}

export function buildViesPoznamBlock(input: BuildViesPoznamBlockInput): string {
  const lines: string[] = []
  const vatApplied = isVatAppliedTaxRegime(input.taxRegime)
  const buyer =
    (input.buyerVatId ?? '').trim() || null
  const afterCreate = input.verifiedAfterOrderCreation === true

  if (input.status === 'ERROR') {
    lines.push('VIES REVIEW REQUIRED')
    lines.push('VIES status: verification unavailable')
    if (buyer) lines.push(`Buyer VAT: ${buyer}`)
    if (vatApplied) lines.push('VAT applied to order')
    if (afterCreate) lines.push('Original order tax unchanged')
    lines.push(`Checked: ${input.checkedAtIso}`)
    if (input.requestIdentifier?.trim()) {
      lines.push(`VIES consultation: ${input.requestIdentifier.trim()}`)
    }
    lines.push('Review/retry in Green Angels Backstage')
    return lines.join('\n')
  }

  if (input.status === 'INVALID') {
    lines.push('VIES status: INVALID')
    if (buyer) lines.push(`Buyer VAT: ${buyer}`)
    if (vatApplied) lines.push('VAT applied to order')
    if (afterCreate) lines.push('Original order tax unchanged')
    lines.push(`Checked: ${input.checkedAtIso}`)
    if (input.requestIdentifier?.trim()) {
      lines.push(`VIES consultation: ${input.requestIdentifier.trim()}`)
    }
    return lines.join('\n')
  }

  // VALID
  if (afterCreate && vatApplied) {
    lines.push('VIES status: VALID — verified after order creation')
    if (buyer) lines.push(`Buyer VAT: ${buyer}`)
    lines.push('Original order tax unchanged')
    lines.push('Review tax/accounting if correction is required')
    lines.push(`Verified: ${input.checkedAtIso}`)
  } else {
    lines.push('VIES status: VALID')
    if (buyer) lines.push(`Buyer VAT: ${buyer}`)
    if (vatApplied) lines.push('VAT applied to order')
    lines.push(`Checked: ${input.checkedAtIso}`)
  }
  if (input.requestIdentifier?.trim()) {
    lines.push(`VIES consultation: ${input.requestIdentifier.trim()}`)
  }
  if (input.registeredName?.trim()) {
    lines.push(`VIES name: ${input.registeredName.trim()}`)
  }
  return lines.join('\n')
}

/** Narrow Flexi PUT body: identity + poznam only (audit helper for tests). */
export function buildNarrowViesPoznamPutPayload(input: {
  flexiOrderId: string
  poznam: string
}): Record<string, string> {
  return {
    id: input.flexiOrderId,
    poznam: input.poznam,
  }
}
