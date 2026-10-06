-- Stable review-request links: store AES-GCM ciphertext of raw token for resend without rotation.
ALTER TABLE "ReviewRequest" ADD COLUMN IF NOT EXISTS "tokenEncrypted" TEXT;
