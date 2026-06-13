import type { CartCheckoutSettings, DeliveryMode } from './cart-checkout.types'
import { DEFAULT_CART_CHECKOUT_SETTINGS } from './cart-checkout.types'

function isDeliveryMode(value: unknown): value is DeliveryMode {
  return value === 'free' || value === 'carrier_rates' || value === 'fixed'
}

/** Підтримка старих налаштувань без deliveryMode. */
export function normalizeCartCheckoutSettings(
  raw: Partial<CartCheckoutSettings> | null | undefined,
): CartCheckoutSettings {
  const base = { ...DEFAULT_CART_CHECKOUT_SETTINGS, ...raw }

  let deliveryMode = base.deliveryMode
  if (!isDeliveryMode(deliveryMode)) {
    deliveryMode =
      base.deliveryAmount > 0 ? 'fixed' : DEFAULT_CART_CHECKOUT_SETTINGS.deliveryMode
  }

  return {
    ...base,
    deliveryMode,
    deliveryAmount: Math.max(0, Number(base.deliveryAmount) || 0),
    packagingAmount: Math.max(0, Number(base.packagingAmount) || 0),
    taxRatePercent: Math.max(0, Number(base.taxRatePercent) || 0),
    belowMinPackagingFee: Math.max(0, Number(base.belowMinPackagingFee) || 0),
    minOrderAmount:
      base.minOrderAmount != null && base.minOrderAmount > 0 ? base.minOrderAmount : null,
  }
}
