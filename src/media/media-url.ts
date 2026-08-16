import { joinPublicBase, PUBLIC_UPLOAD_PREFIX } from './media-keys'

export function toPublicMediaUrl(
  storedUrl: string | null | undefined,
  publicBaseUrl?: string | null,
): string {
  const trimmed = storedUrl?.trim() || ''
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const base = publicBaseUrl?.trim()
  if (!base) return trimmed
  if (!trimmed.startsWith(`${PUBLIC_UPLOAD_PREFIX}/`) && trimmed !== PUBLIC_UPLOAD_PREFIX) {
    return trimmed
  }
  return joinPublicBase(base, trimmed)
}
