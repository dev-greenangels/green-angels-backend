-- CHECKOUT-PAYMENT-LIFECYCLE-002: stock accounting + payment clocks + email idempotency flags

ALTER TABLE "OrderItem" ADD COLUMN "stockDecremented" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order" ADD COLUMN "stockReleasedAt" TIMESTAMP(3),
ADD COLUMN "paymentExpiresAt" TIMESTAMP(3),
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "awaitingPaymentEmailSentAt" TIMESTAMP(3),
ADD COLUMN "paymentReminderEmailSentAt" TIMESTAMP(3),
ADD COLUMN "cancelledUnpaidEmailSentAt" TIMESTAMP(3),
ADD COLUMN "latePayRefundEmailSentAt" TIMESTAMP(3);

CREATE INDEX "Order_status_paymentExpiresAt_idx" ON "Order"("status", "paymentExpiresAt");

-- Ensure storefront USER cancel can use customer_request
UPDATE "CancellationReason" SET "allowUser" = true WHERE code = 'customer_request' AND "allowUser" = false;
