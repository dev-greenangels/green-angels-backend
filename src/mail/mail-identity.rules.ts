import type { CountrySiteCode } from '../settings/market.types'
import { emailDomain } from './country-hosts'
import type { MailIdentity, MailIdentityKind } from './mail-identity.service'

export type BuildMailIdentityInput = {
  kind: MailIdentityKind
  domain: string
  supportEmail: string | null
  countrySiteCode: CountrySiteCode | null
  localPart?: string
  replyToOverride?: string | null
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

  if (input.kind === 'otp') {
    return {
      from: `${localPart}@${domain}`,
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
      from: support,
      replyTo: input.replyToOverride?.trim() || null,
      domain,
      countrySiteCode: input.countrySiteCode,
    }
  }

  return {
    from: support,
    replyTo: support,
    domain,
    countrySiteCode: input.countrySiteCode,
  }
}
