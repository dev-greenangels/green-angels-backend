export const GUEST_CART_COOKIE_NAME = 'ga-cart-guest'
export const GUEST_CART_MAX_AGE_SEC = 60 * 60 * 24 * 30

export type CartLineDto = {
  productVariantId: string
  quantity: number
}

export type CartLineView = CartLineDto & {
  productId: string
  productSlug: string
  productName: string
  variantLabel: string | null
}

export type CartMergeStrategy = 'merge' | 'keep_guest' | 'keep_user' | 'clear'
