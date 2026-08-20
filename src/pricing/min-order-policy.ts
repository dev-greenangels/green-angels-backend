import { Role } from '@prisma/client'

import type {
  BelowMinOrderBehavior,
  CartCheckoutSettings,
} from '../settings/cart-checkout.types'

export type ResolvedMinOrderPolicy = {
  minOrderAmount: number | null
  belowMinOrderBehavior: BelowMinOrderBehavior
  belowMinPackagingFee: number
  /** true when audience is WHOLESALER */
  isWholesaler: boolean
}

/** Роздріб (гість / USER) vs гурт (WHOLESALER) — окремі поля cart.checkout. */
export function resolveMinOrderPolicy(
  settings: CartCheckoutSettings,
  audienceRole?: Role | string | null,
): ResolvedMinOrderPolicy {
  const isWholesaler = audienceRole === Role.WHOLESALER || audienceRole === 'WHOLESALER'
  if (isWholesaler) {
    const amount = settings.wholesalerMinOrderAmount
    return {
      isWholesaler: true,
      minOrderAmount: amount != null && amount > 0 ? amount : null,
      belowMinOrderBehavior: settings.wholesalerBelowMinOrderBehavior,
      belowMinPackagingFee: Math.max(0, settings.wholesalerBelowMinPackagingFee || 0),
    }
  }
  const amount = settings.minOrderAmount
  return {
    isWholesaler: false,
    minOrderAmount: amount != null && amount > 0 ? amount : null,
    belowMinOrderBehavior: settings.belowMinOrderBehavior,
    belowMinPackagingFee: Math.max(0, settings.belowMinPackagingFee || 0),
  }
}
