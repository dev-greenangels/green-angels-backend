export type CookieConsentAuditPurpose = 'COOKIES_ANALYTICS' | 'COOKIES_MARKETING'
export type CookieConsentAuditAction = 'GRANTED' | 'WITHDRAWN'

export type CookieConsentAuditEventPlan = {
  purpose: CookieConsentAuditPurpose
  action: CookieConsentAuditAction
}

/**
 * Expand one cookie-preferences save into independent audit rows.
 * Analytics and Marketing must never share a single purpose/action.
 */
export function planCookieConsentAuditEvents(input: {
  analytics: boolean
  marketing: boolean
}): CookieConsentAuditEventPlan[] {
  return [
    {
      purpose: 'COOKIES_ANALYTICS',
      action: input.analytics ? 'GRANTED' : 'WITHDRAWN',
    },
    {
      purpose: 'COOKIES_MARKETING',
      action: input.marketing ? 'GRANTED' : 'WITHDRAWN',
    },
  ]
}

/** Cookie-banner saves send both booleans; expand to two audit purposes. */
export function shouldExpandCookieCategoryConsent(dto: {
  purpose: string
  analytics?: boolean
  marketing?: boolean
}): boolean {
  return (
    dto.purpose === 'COOKIES_ANALYTICS' &&
    typeof dto.analytics === 'boolean' &&
    typeof dto.marketing === 'boolean'
  )
}
