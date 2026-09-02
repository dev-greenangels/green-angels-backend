import type { CountrySiteCode, MarketRegion } from '../settings/market.types'
import { emailDomain } from './country-hosts'
import type { MailIdentity, MailIdentityKind } from './mail-identity.service'

export type BuildMailIdentityInput = {
  kind: MailIdentityKind
  domain: string
  supportEmail: string | null
  countrySiteCode: CountrySiteCode | null
  localPart?: string
  replyToOverride?: string | null
  /** Deploy market — drives RFC5322 display name in From */
  marketRegion?: MarketRegion
}

export function resolveMailSenderDisplayName(region: MarketRegion): string {
  return region === 'sk' ? 'Green Angels' : 'Зелені Янголи'
}

/** RFC 5322: `"Display Name" <user@domain>` */
export function formatMailFromAddress(displayName: string, email: string): string {
  const safeName = displayName.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${safeName}" <${email.trim()}>`
}

/**
 * Pure From/Reply-To rules (OTP noreply vs order support).
 * supportEmail must be on `domain` for order/stock/wholesale From.
 */
export function buildMailIdentity(input: BuildMailIdentityInput): MailIdentity | null {
  const domain = input.domain.trim().toLowerCase()
  if (!domain) return null

  const support = input.supportEmail?.trim() || null
  const localPart = (input.localPart?.trim() || 'noreply').toLowerCase()
  const displayName = input.marketRegion
    ? resolveMailSenderDisplayName(input.marketRegion)
    : null

  const withDisplay = (email: string) =>
    displayName ? formatMailFromAddress(displayName, email) : email

  if (input.kind === 'otp') {
    return {
      from: withDisplay(`${localPart}@${domain}`),
      replyTo: support,
      domain,
      countrySiteCode: input.countrySiteCode,
    }
  }

  if (!support || emailDomain(support) !== domain) {
    return null
  }

  if (input.kind === 'wholesale') {
    return {
      from: withDisplay(support),
      replyTo: input.replyToOverride?.trim() || null,
      domain,
      countrySiteCode: input.countrySiteCode,
    }
  }

  return {
    from: withDisplay(support),
    replyTo: support,
    domain,
    countrySiteCode: input.countrySiteCode,
  }
}
