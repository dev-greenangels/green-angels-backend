const LEGACY_CMS_HOST = /landshaft\.info/i

/**
 * Seed / neutralize-migration placeholders that were never added under public/.
 * Missing files fall through App Router → fake PDP → GET /products/by-slug/*.jpg.
 */
export const LEGACY_NURSERY_GALLERY_PLACEHOLDER_PATHS = [
  '/images/nursery/field.jpg',
  '/images/nursery/greenhouse.jpg',
  '/images/nursery/warehouse.jpg',
  '/images/nursery/packing.jpg',
] as const

const LEGACY_NURSERY_PLACEHOLDER_PATH_SET = new Set<string>(
  LEGACY_NURSERY_GALLERY_PLACEHOLDER_PATHS,
)

function pathnameOnly(url: string): string {
  const withoutHash = url.split('#')[0] ?? url
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash
  return withoutQuery.trim()
}

export function isLegacyNurseryGalleryPlaceholderUrl(
  url: string | null | undefined,
): boolean {
  const path = pathnameOnly(url?.trim() ?? '').toLowerCase()
  return LEGACY_NURSERY_PLACEHOLDER_PATH_SET.has(path)
}

export function isLegacyCmsImageUrl(url: string | null | undefined): boolean {
  const trimmed = url?.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('/')) return false
  try {
    return LEGACY_CMS_HOST.test(new URL(trimmed).hostname)
  } catch {
    return LEGACY_CMS_HOST.test(trimmed)
  }
}

/** Strip legacy CMS hosts, known missing nursery placeholders, and blanks. */
export function sanitizeCmsImageUrl(url: string | null | undefined): string {
  const trimmed = url?.trim() ?? ''
  if (!trimmed || isLegacyCmsImageUrl(trimmed)) return ''
  if (isLegacyNurseryGalleryPlaceholderUrl(trimmed)) return ''
  return trimmed
}
