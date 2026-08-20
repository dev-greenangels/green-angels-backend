export type CreatePaymentInput = {
  orderId: string
  orderNumber: number
  /** Major units (e.g. 199.90 UAH), not cents/kopecks */
  amount: number
  currency: string
  description: string
  customerEmail?: string | null
  successUrl: string
  failUrl: string
  /**
   * Stripe Elements (`ui_mode: elements`) return URL after 3DS / wallet auth.
   * Hosted redirect providers ignore this and use successUrl / failUrl.
   */
  returnUrl?: string
  /** Guest confirmation JWT to embed in Mono redirect (Stripe uses successUrl). */
  confirmationToken?: string
  /** Optional PSP metadata (buyerType, companyVatId, …) */
  metadata?: Record<string, string>
}

export type CreatePaymentResult = {
  provider: string
  paymentId: string
  /** Hosted checkout URL (MonoPay). Absent for Stripe Payment Element. */
  paymentPageUrl?: string
  /** Stripe Checkout Session client_secret for Payment Element. */
  clientSecret?: string
  /** Stripe publishable key (pk_…) — public; used only to load Stripe.js. */
  publishableKey?: string
}

export interface PaymentProvider {
  readonly id: string
  isConfigured(): boolean
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
}
