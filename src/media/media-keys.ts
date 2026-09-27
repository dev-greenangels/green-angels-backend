/** Public URL prefix stored in Postgres (`ProductImage.url`, `Category.image`, …). */
export const PUBLIC_UPLOAD_PREFIX = '/uploads'

/** Legacy private-key prefix (pre two-bucket). Still readable for old OrderDocument rows. */
export const LEGACY_PRIVATE_OBJECT_PREFIX = 'private/'

/** Canonical OrderDocument keys live under this prefix inside the private bucket. */
export const ORDER_DOCUMENT_KEY_PREFIX = 'orders/'

export type MediaKind = 'product' | 'category' | 'blog' | 'review' | 'estimate'

export type ClassifiedMediaFile =
  | { kind: MediaKind; diskRelative: string; key: string; publicPath: string }
  | { kind: 'unmapped'; diskRelative: string }

export function normalizePosix(relative: string): string {
  return relative.replace(/\\/g, '/').replace(/^\/+/, '')
}

/** True for keys that must never use the public media bucket / public URL helpers. */
export function isPrivateObjectKey(key: string): boolean {
  const normalized = normalizePosix(key)
  return (
    normalized.startsWith(ORDER_DOCUMENT_KEY_PREFIX) ||
    normalized.startsWith(LEGACY_PRIVATE_OBJECT_PREFIX)
  )
}

/** Object key in R2 = public pathname without leading slash. */
export function publicPathToKey(publicPath: string): string {
  const raw = publicPath.trim()
  const pathname = /^https?:\/\//i.test(raw) ? new URL(raw).pathname : raw
  const normalized = normalizePosix(pathname.split('?')[0] ?? pathname)
  if (!normalized.startsWith('uploads/')) {
    throw new Error(`Некоректний media key: ${publicPath}`)
  }
  return normalized
}

export function diskRelativeToKey(diskRelative: string): string {
  return `uploads/${normalizePosix(diskRelative)}`
}

export function keyToPublicPath(key: string): string {
  const normalized = normalizePosix(key)
  if (isPrivateObjectKey(normalized)) {
    throw new Error(`Приватний media key не має публічного URL: ${key}`)
  }
  return `/${normalized}`
}

export function estimateRelativeToKey(relativePath: string): string {
  return diskRelativeToKey(`estimate-photos/${normalizePosix(relativePath)}`)
}

/** Canonical private-bucket object key for the confirmation PDF. */
export function orderConfirmationPdfKey(orderId: string): string {
  const id = orderId.trim()
  if (!id) throw new Error('orderId required for confirmation PDF key')
  return `${ORDER_DOCUMENT_KEY_PREFIX}${id}/confirmation.pdf`
}

/** Local filesystem relative path under PRIVATE_STORAGE_ROOT. */
export function privateKeyToLocalRelative(key: string): string {
  const normalized = normalizePosix(key)
  if (normalized.startsWith(LEGACY_PRIVATE_OBJECT_PREFIX)) {
    return normalized.slice(LEGACY_PRIVATE_OBJECT_PREFIX.length)
  }
  if (normalized.startsWith(ORDER_DOCUMENT_KEY_PREFIX)) {
    return normalized
  }
  throw new Error(`Некоректний private media key: ${key}`)
}

export function classifyUploadRootFile(diskRelative: string): ClassifiedMediaFile {
  const rel = normalizePosix(diskRelative)
  const key = diskRelativeToKey(rel)
  const publicPath = keyToPublicPath(key)

  if (rel.startsWith('products/')) {
    return { kind: 'product', diskRelative: rel, key, publicPath }
  }
  if (rel.startsWith('categories/')) {
    return { kind: 'category', diskRelative: rel, key, publicPath }
  }
  if (rel.startsWith('blog/')) {
    return { kind: 'blog', diskRelative: rel, key, publicPath }
  }
  if (rel.startsWith('reviews/')) {
    return { kind: 'review', diskRelative: rel, key, publicPath }
  }
  if (rel.startsWith('estimate-photos/')) {
    return { kind: 'estimate', diskRelative: rel, key, publicPath }
  }
  return { kind: 'unmapped', diskRelative: rel }
}

export function joinPublicBase(base: string, publicPath: string): string {
  const root = base.replace(/\/+$/, '')
  const path = publicPath.startsWith('/') ? publicPath : `/${publicPath}`
  return `${root}${path}`
}
