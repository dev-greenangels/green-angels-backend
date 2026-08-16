import { UNPAGINATED_PRODUCT_TAKE_MAX } from './unpaginated-product-take'

/** First-occurrence unique slugs from `?slugs=a,b,c`, capped like unpaginated take. */
export function parseSlugQueryList(
  raw?: string,
  max = UNPAGINATED_PRODUCT_TAKE_MAX,
): string[] {
  if (!raw?.trim()) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(',')) {
    const slug = part.trim()
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    out.push(slug)
    if (out.length >= max) break
  }
  return out
}

export function orderRowsBySlugList<T extends { slug: string }>(
  rows: T[],
  slugs: string[],
): T[] {
  const bySlug = new Map<string, T>()
  for (const row of rows) {
    if (!bySlug.has(row.slug)) bySlug.set(row.slug, row)
  }
  const seen = new Set<string>()
  const ordered: T[] = []
  for (const slug of slugs) {
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    const row = bySlug.get(slug)
    if (row) ordered.push(row)
  }
  return ordered
}
