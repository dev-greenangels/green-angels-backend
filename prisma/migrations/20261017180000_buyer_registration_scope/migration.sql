-- BuyerRegistrationScope: orthogonal auth gate for DiscountRule + PromoCode.
-- Additive only. Does not alter eligibleAudiences / onlyForRoles semantics.
-- Default ANY preserves legacy behaviour for existing rows.

CREATE TYPE "BuyerRegistrationScope" AS ENUM ('ANY', 'GUEST_ONLY', 'REGISTERED_ONLY');

ALTER TABLE "DiscountRule"
  ADD COLUMN "buyerRegistrationScope" "BuyerRegistrationScope" NOT NULL DEFAULT 'ANY';

ALTER TABLE "PromoCode"
  ADD COLUMN "buyerRegistrationScope" "BuyerRegistrationScope" NOT NULL DEFAULT 'ANY';
