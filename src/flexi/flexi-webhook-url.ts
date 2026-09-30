/**
 * Webhook registration safety — never skip ABRA URL test.
 */

export const LOCAL_WEBHOOK_URL_REJECTED =
  'Webhook URL is local and cannot be reached by ABRA. Automatic webhook synchronization requires a public HTTPS URL.'

/**
 * True when ABRA (cloud/remote) cannot deliver HTTP callbacks to this URL.
 * Covers localhost, loopback, ::1, and corrupt double-scheme smoke URLs.
 */
export function isLocalOnlyWebhookUrl(url: string): boolean {
  const raw = (url || '').trim()
  if (!raw) return false
  const lower = raw.toLowerCase()

  // Corrupt smoke leftovers: https://http://localhost…
  if (/^https?:\/\/https?:\/\//i.test(raw)) {
    return isLocalOnlyWebhookUrl(raw.replace(/^https?:\/\//i, ''))
  }

  try {
    const parsed = new URL(lower.includes('://') ? lower : `https://${lower}`)
    const host = parsed.hostname.replace(/^\[|\]$/g, '')
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.localhost')
    ) {
      return true
    }
  } catch {
    // substring fallback below
  }

  return (
    lower.includes('://localhost') ||
    lower.includes('://127.0.0.1') ||
    lower.includes('://[::1]') ||
    /:\/\/::1(?::|\/|$)/.test(lower)
  )
}
