const LEGACY_CMS_HOST = /landshaft\.info/i

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

export function sanitizeCmsImageUrl(url: string | null | undefined): string {
  const trimmed = url?.trim() ?? ''
  if (!trimmed || isLegacyCmsImageUrl(trimmed)) return ''
  return trimmed
}
