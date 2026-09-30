/**
 * Pure helpers for Flexi webhook / Changes notification parsing.
 * Kept free of Nest DI for unit tests.
 */

export type ParsedFlexiChangeNotification = {
  evidence: string
  id?: string | number
  operation?: string
  globalVersion?: number
  inVersion?: number
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value !== undefined && value !== null) return [value as T]
  return []
}

/** Normalize Flexi id field — may be scalar or array; pick first non-empty. */
export function pickFlexiObjectId(raw: unknown): string | null {
  for (const candidate of asArray(raw)) {
    if (candidate === undefined || candidate === null) continue
    if (typeof candidate === 'object') {
      const obj = candidate as Record<string, unknown>
      const nested = obj.id ?? obj['@id'] ?? obj.value
      const picked = pickFlexiObjectId(nested)
      if (picked) return picked
      continue
    }
    const s = String(candidate).trim()
    if (s) return s
  }
  return null
}

/**
 * Expand one webhook/change row into one-or-more notifications when Flexi
 * sends multiple ids for the same evidence.
 */
export function expandFlexiChangeRow(row: Record<string, unknown>): ParsedFlexiChangeNotification[] {
  const evidence = String(row.evidence ?? row['@evidence'] ?? '').trim()
  const operation = String(row.operation ?? row['@operation'] ?? '').trim()
  const inRaw = row['@in-version'] ?? row.inVersion ?? row['in-version']
  const inNum = Number(inRaw)
  const inVersion = Number.isFinite(inNum) && inNum > 0 ? Math.trunc(inNum) : undefined
  const gvNum = Number(row.globalVersion ?? row['@globalVersion'] ?? 0)
  const globalVersion = Number.isFinite(gvNum) && gvNum > 0 ? Math.trunc(gvNum) : undefined

  const idRaw = row.id ?? row['@id']
  const ids = asArray(idRaw)
    .map((v) => pickFlexiObjectId(v))
    .filter((v): v is string => Boolean(v))

  if (ids.length === 0) {
    return [
      {
        evidence,
        operation: operation || undefined,
        inVersion,
        globalVersion,
      },
    ]
  }

  return ids.map((id) => ({
    evidence,
    id,
    operation: operation || undefined,
    inVersion,
    globalVersion,
  }))
}

export function parseFlexiWebhookBody(body: unknown): ParsedFlexiChangeNotification[] {
  if (!body || typeof body !== 'object') return []
  const root =
    'winstrom' in body
      ? ((body as { winstrom: Record<string, unknown> }).winstrom ?? {})
      : (body as Record<string, unknown>)
  const rawChanges = root.change ?? root.changes ?? []
  const list = asArray<Record<string, unknown>>(rawChanges)
  const out: ParsedFlexiChangeNotification[] = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    out.push(...expandFlexiChangeRow(row))
  }
  return out
}
