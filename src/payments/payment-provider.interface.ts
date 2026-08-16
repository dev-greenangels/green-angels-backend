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
  /** Guest confirmation JWT to embed in Mono redirect (Stripe uses successUrl). */
  confirmationToken?: string
  /** Optional PSP metadata (buyerType, companyVatId, …) */
  metadata?: Record<string, string>
}

export type CreatePaymentResult = {
  provider: string
  paymentId: string
  paymentPageUrl: string
}

export interface PaymentProvider {
  readonly id: string
  isConfigured(): boolean
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>
}
