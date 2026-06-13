export type BelowMinOrderBehavior = 'reject' | 'add_packaging_fee'

export type DeliveryMode = 'free' | 'carrier_rates' | 'fixed'

export type CartCheckoutSettings = {
  showDelivery: boolean
  showPackaging: boolean
  showTax: boolean
  /** free — безкоштовно; carrier_rates — за тарифами НП; fixed — фіксована сума */
  deliveryMode: DeliveryMode
  deliveryAmount: number
  packagingAmount: number
  taxRatePercent: number
  /** Якщо true — ПДВ уже в цінах товарів, рядок податку лише інформативний */
  taxIncluded: boolean
  /** Безкоштовна доставка при самовивозі */
  deliveryFreeForPickup: boolean
  minOrderAmount: number | null
  belowMinOrderBehavior: BelowMinOrderBehavior
  belowMinPackagingFee: number
}

export const DEFAULT_CART_CHECKOUT_SETTINGS: CartCheckoutSettings = {
  showDelivery: true,
  showPackaging: true,
  showTax: true,
  deliveryMode: 'carrier_rates',
  deliveryAmount: 0,
  packagingAmount: 0,
  taxRatePercent: 20,
  taxIncluded: true,
  deliveryFreeForPickup: true,
  minOrderAmount: null,
  belowMinOrderBehavior: 'reject',
  belowMinPackagingFee: 0,
}
