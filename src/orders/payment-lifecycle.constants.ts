/** Customer-facing card deadline / Stripe expires_at / Mono validity (Appendix B). */
export const CUSTOMER_PAYMENT_WINDOW_SEC = 1800

/** SYSTEM cancel runs at createdAt + 40m (= customer window + buffer). */
export const SYSTEM_CANCEL_BUFFER_SEC = 600

/** Payment reminder email delay from create (createdAt + 20m). */
export const PAYMENT_REMINDER_DELAY_SEC = 1200

export const SYSTEM_CANCEL_AFTER_SEC =
  CUSTOMER_PAYMENT_WINDOW_SEC + SYSTEM_CANCEL_BUFFER_SEC
