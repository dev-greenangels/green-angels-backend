/** Relative paths under `uploads/estimate-photos/`. */
export const FRESH_PHOTO_MAIN = 'main.webp'
export const FRESH_PHOTO_THUMB = 'thumb.webp'

export const DEFAULT_FRESH_PHOTOS_LIMIT = 4
export const FRESH_PHOTOS_LIMIT_MIN = 1
/** Abuse cap for a single variant size — not a product-business max. */
export const FRESH_PHOTOS_LIMIT_MAX = 100

export function normalizeFreshPhotosLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_FRESH_PHOTOS_LIMIT
  }
  const n = Math.trunc(value)
  if (n < FRESH_PHOTOS_LIMIT_MIN) return DEFAULT_FRESH_PHOTOS_LIMIT
  return Math.min(FRESH_PHOTOS_LIMIT_MAX, n)
}

/** `{fileId}/main.webp` — one logical photo, variants are sibling objects. */
export function freshPhotoMainRelativePath(fileId: string): string {
  return `${fileId.trim()}/${FRESH_PHOTO_MAIN}`
}

export function isFreshPhotoVariantRelativePath(relativePath: string): boolean {
  return /(?:^|\/)main\.webp$/i.test(relativePath.trim())
}

export function freshPhotoThumbRelativePath(relativePath: string): string {
  const trimmed = relativePath.trim()
  if (!isFreshPhotoVariantRelativePath(trimmed)) return trimmed
  return trimmed.replace(/main\.webp$/i, FRESH_PHOTO_THUMB)
}

export function freshPhotoDirKey(fileId: string): string {
  return `uploads/estimate-photos/${fileId.trim()}`
}

export function freshPhotoR2ObjectKeys(fileId: string): { main: string; thumb: string } {
  const dir = freshPhotoDirKey(fileId)
  return {
    main: `${dir}/${FRESH_PHOTO_MAIN}`,
    thumb: `${dir}/${FRESH_PHOTO_THUMB}`,
  }
}

export type FreshPhotoDeletePlan =
  | { mode: 'prefix'; prefix: string }
  | { mode: 'object'; relativePath: string }

/** Variant photos: delete the fileId prefix. Legacy originals: single object. */
export function freshPhotoDeletePlan(
  fileId: string,
  relativePath: string,
): FreshPhotoDeletePlan {
  const id = fileId.trim()
  if (id && isFreshPhotoVariantRelativePath(relativePath)) {
    return { mode: 'prefix', prefix: `${freshPhotoDirKey(id)}/` }
  }
  return { mode: 'object', relativePath }
}

/**
 * After a new photo is stored, ids of oldest rows to delete so count <= limit.
 * Does not mutate. Newest-last sort by ISO date then createdAt.
 */
export function fileIdsExceedingFreshPhotoLimit<
  T extends {
    fileId: string
    createdAt: Date | string
    appProperties?: { date?: string }
  },
>(photos: T[], limit: number): string[] {
  const max = normalizeFreshPhotosLimit(limit)
  if (photos.length <= max) return []

  const sorted = [...photos].sort((a, b) => {
    const dateA = Date.parse(a.appProperties?.date || toIso(a.createdAt)) || 0
    const dateB = Date.parse(b.appProperties?.date || toIso(b.createdAt)) || 0
    if (dateA !== dateB) return dateA - dateB
    return toIso(a.createdAt).localeCompare(toIso(b.createdAt))
  })

  return sorted.slice(0, photos.length - max).map((photo) => photo.fileId)
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value
}
