/** Public URL prefix stored in Postgres (`ProductImage.url`, `Category.image`, …). */
export const PUBLIC_UPLOAD_PREFIX = '/uploads'

export type MediaKind = 'product' | 'category' | 'blog' | 'review' | 'estimate'

export type ClassifiedMediaFile =
  | { kind: MediaKind; diskRelative: string; key: string; publicPath: string }
  | { kind: 'unmapped'; diskRelative: string }

export function normalizePosix(relative: string): string {
  return relative.replace(/\\/g, '/').replace(/^\/+/, '')
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
  return `/${normalizePosix(key)}`
}

export function estimateRelativeToKey(relativePath: string): string {
  return diskRelativeToKey(`estimate-photos/${normalizePosix(relativePath)}`)
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
