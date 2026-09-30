/** Explicit confirm tokens for destructive ABRA hook management (not journal). */
export const DELETE_ALL_ABRA_HOOKS_CONFIRM = 'DELETE_ALL_ABRA_HOOKS'
export const DELETE_ORPHAN_ABRA_HOOKS_CONFIRM = 'DELETE_ORPHAN_ABRA_HOOKS'

export function normalizeHookUrl(url: string): string {
  return url.trim().replace(/\/$/, '').toLowerCase()
}

export function classifyRemoteHook(
  hookUrl: string,
  configuredWebhookUrl: string,
): 'CURRENT' | 'OTHER' {
  const configured = configuredWebhookUrl.trim()
  if (!configured) return 'OTHER'
  return normalizeHookUrl(hookUrl) === normalizeHookUrl(configured) ? 'CURRENT' : 'OTHER'
}

/** ABRA hook ids are numeric strings in practice; keep a conservative allowlist. */
export function isValidHookId(id: string): boolean {
  return /^[0-9A-Za-z_-]{1,64}$/.test(id.trim())
}
