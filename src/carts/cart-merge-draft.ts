import type { Prisma } from '@prisma/client'

import type { CartMergeStrategy } from './cart.constants'
import { parseStoredCheckoutDraft, type CheckoutDraftV1 } from './checkout-draft'

type CartDraftSource = {
  checkoutDraft: Prisma.JsonValue | null
  checkoutStartedAt: Date | null
  updatedAt: Date
} | null

/**
 * Deterministic checkoutDraft ownership after guest↔auth merge.
 *
 * - clear → no draft
 * - keep_user → auth cart draft
 * - keep_guest → guest cart draft
 * - merge → single coherent draft: only-one wins; both → newer updatedAt wins; tie → guest
 *
 * Does not field-merge JSON blobs.
 */
export function resolveCheckoutDraftAfterMerge(input: {
  strategy: CartMergeStrategy
  guestCart: CartDraftSource
  userCart: CartDraftSource
}): {
  draft: CheckoutDraftV1 | null
  checkoutStartedAt: Date | null
} {
  const { strategy, guestCart, userCart } = input

  if (strategy === 'clear') {
    return { draft: null, checkoutStartedAt: null }
  }

  if (strategy === 'keep_user') {
    return {
      draft: parseStoredCheckoutDraft(userCart?.checkoutDraft ?? null),
      checkoutStartedAt: userCart?.checkoutStartedAt ?? null,
    }
  }

  if (strategy === 'keep_guest') {
    return {
      draft: parseStoredCheckoutDraft(guestCart?.checkoutDraft ?? null),
      checkoutStartedAt: guestCart?.checkoutStartedAt ?? null,
    }
  }

  // merge
  const guestDraft = parseStoredCheckoutDraft(guestCart?.checkoutDraft ?? null)
  const userDraft = parseStoredCheckoutDraft(userCart?.checkoutDraft ?? null)

  if (!guestDraft && !userDraft) {
    return { draft: null, checkoutStartedAt: null }
  }
  if (guestDraft && !userDraft) {
    return {
      draft: guestDraft,
      checkoutStartedAt: guestCart?.checkoutStartedAt ?? null,
    }
  }
  if (!guestDraft && userDraft) {
    return {
      draft: userDraft,
      checkoutStartedAt: userCart?.checkoutStartedAt ?? null,
    }
  }

  const guestAt = guestCart?.updatedAt?.getTime() ?? 0
  const userAt = userCart?.updatedAt?.getTime() ?? 0
  if (guestAt >= userAt) {
    return {
      draft: guestDraft,
      checkoutStartedAt: guestCart?.checkoutStartedAt ?? null,
    }
  }
  return {
    draft: userDraft,
    checkoutStartedAt: userCart?.checkoutStartedAt ?? null,
  }
}
