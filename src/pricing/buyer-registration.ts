import {
  BuyerRegistrationScope,
  PromoEligibleAudience,
} from '@prisma/client'
import { BadRequestException } from '@nestjs/common'

/** GUEST = no customer session userId; REGISTERED = Boolean(userId). */
export function isRegisteredBuyer(audience: { userId?: string | null }): boolean {
  return Boolean(audience.userId?.trim())
}

export function matchesBuyerRegistrationScope(
  scope: BuyerRegistrationScope | null | undefined,
  audience: { userId?: string | null },
): boolean {
  const resolved = scope ?? BuyerRegistrationScope.ANY
  if (resolved === BuyerRegistrationScope.ANY) return true
  const registered = isRegisteredBuyer(audience)
  if (resolved === BuyerRegistrationScope.GUEST_ONLY) return !registered
  if (resolved === BuyerRegistrationScope.REGISTERED_ONLY) return registered
  return true
}

/**
 * Explicit 400s — no silent coerce.
 * GUEST_ONLY cannot combine with allowlists or WHOLESALER-only commercial audience.
 */
export function assertBuyerRegistrationScopeDto(input: {
  buyerRegistrationScope?: BuyerRegistrationScope | null
  allowedUserIds?: string[] | null
  eligibleAudiences?: PromoEligibleAudience[] | null
}): void {
  const scope = input.buyerRegistrationScope ?? BuyerRegistrationScope.ANY
  if (scope !== BuyerRegistrationScope.GUEST_ONLY) return

  if ((input.allowedUserIds ?? []).length > 0) {
    throw new BadRequestException(
      'GUEST_ONLY не можна поєднувати з обмеженням конкретними користувачами (allowedUserIds).',
    )
  }

  const audiences = input.eligibleAudiences ?? []
  if (
    audiences.length > 0 &&
    !audiences.includes(PromoEligibleAudience.RETAIL)
  ) {
    throw new BadRequestException(
      'GUEST_ONLY потребує комерційну пропозицію RETAIL (або BOTH). WHOLESALER-only заборонено.',
    )
  }
}

/** Synthetic id for backoffice REGISTERED preview without a real customer (never matches DB allowlists). */
export const PREVIEW_REGISTERED_SENTINEL_USER_ID =
  '11111111-1111-4111-8111-111111111111'
