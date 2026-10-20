/**
 * Human-readable discount / promo lines for ABRA Received Order `poznam`.
 * Commercial amounts stay on Flexi lines (slevaPol / negative promo line).
 */

export type FlexiDiscountNotePromo = {
  code: string
  discountType?: string | null
  /** Configured PromoCode value (PERCENT % or FIXED amount). */
  value?: number | null
  /** Applied product FIXED amount when configured value missing. */
  totalDiscountAmount?: number | null
  productDiscountAmount?: number | null
}

function formatMoneyAmount(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
  return `${text} ${currency}`
}

function formatPromoValue(
  promo: FlexiDiscountNotePromo,
  currency: string,
): string | null {
  const type = (promo.discountType ?? '').toUpperCase()
  const configured =
    promo.value != null && Number.isFinite(Number(promo.value))
      ? Number(promo.value)
      : null

  if (type === 'PERCENT') {
    if (configured == null) return null
    return `−${configured}%`
  }

  if (type === 'FIXED') {
    const amount =
      configured != null && configured > 0
        ? configured
        : promo.productDiscountAmount != null && promo.productDiscountAmount > 0
          ? Number(promo.productDiscountAmount)
          : promo.totalDiscountAmount != null && promo.totalDiscountAmount > 0
            ? Number(promo.totalDiscountAmount)
            : null
    if (amount == null) return null
    return `−${formatMoneyAmount(amount, currency)}`
  }

  // Unknown type — still show configured value when present.
  if (configured == null) return null
  if (configured > 0 && configured <= 100 && type !== 'FIXED') {
    return `−${configured}%`
  }
  return `−${formatMoneyAmount(configured, currency)}`
}

/** Build `poznam` lines: promo codes + DiscountRule names. */
export function buildFlexiOrderDiscountNoteLines(input: {
  currency?: string | null
  promos?: FlexiDiscountNotePromo[] | null
  discountRuleNames?: string[] | null
}): string[] {
  const currency = (input.currency ?? 'EUR').trim().toUpperCase() || 'EUR'
  const lines: string[] = []

  const seenPromo = new Set<string>()
  for (const promo of input.promos ?? []) {
    const code = (promo.code ?? '').trim().toUpperCase()
    if (!code || seenPromo.has(code)) continue
    seenPromo.add(code)
    const valueText = formatPromoValue(promo, currency)
    lines.push(valueText ? `Promo: ${code} (${valueText})` : `Promo: ${code}`)
  }

  const seenRules = new Set<string>()
  for (const raw of input.discountRuleNames ?? []) {
    const name = raw.trim()
    if (!name || seenRules.has(name)) continue
    seenRules.add(name)
    lines.push(`Zľava: ${name}`)
  }

  return lines
}

/** Parse discount audit fields from Order.promoCommercialSnapshot JSON. */
export function readDiscountNotesFromPromoSnapshot(
  snapshot: unknown,
  currencyFallback?: string | null,
): { promos: FlexiDiscountNotePromo[]; discountRuleNames: string[]; currency: string } {
  const currency =
    snapshot &&
    typeof snapshot === 'object' &&
    typeof (snapshot as { currency?: unknown }).currency === 'string'
      ? String((snapshot as { currency: string }).currency)
      : currencyFallback ?? 'EUR'

  const promos: FlexiDiscountNotePromo[] = []
  const discountRuleNames: string[] = []

  if (!snapshot || typeof snapshot !== 'object') {
    return { promos, discountRuleNames, currency }
  }

  const root = snapshot as {
    promos?: unknown
    discountRules?: unknown
  }

  if (Array.isArray(root.promos)) {
    for (const row of root.promos) {
      if (!row || typeof row !== 'object') continue
      const p = row as Record<string, unknown>
      const code = typeof p.code === 'string' ? p.code : ''
      if (!code.trim()) continue
      promos.push({
        code,
        discountType: typeof p.discountType === 'string' ? p.discountType : null,
        value: p.value != null && Number.isFinite(Number(p.value)) ? Number(p.value) : null,
        totalDiscountAmount:
          p.totalDiscountAmount != null && Number.isFinite(Number(p.totalDiscountAmount))
            ? Number(p.totalDiscountAmount)
            : null,
        productDiscountAmount:
          p.productDiscountAmount != null && Number.isFinite(Number(p.productDiscountAmount))
            ? Number(p.productDiscountAmount)
            : null,
      })
    }
  }

  if (Array.isArray(root.discountRules)) {
    for (const row of root.discountRules) {
      if (typeof row === 'string' && row.trim()) {
        discountRuleNames.push(row.trim())
        continue
      }
      if (row && typeof row === 'object' && typeof (row as { name?: unknown }).name === 'string') {
        const name = String((row as { name: string }).name).trim()
        if (name) discountRuleNames.push(name)
      }
    }
  }

  return { promos, discountRuleNames, currency }
}
