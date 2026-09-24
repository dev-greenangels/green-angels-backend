import type { MarketRegion, PhonePolicy } from '../settings/market.types'
import { normalizeIntlPhone, normalizePhoneE164, normalizePhoneSkE164 } from './auth.utils'

/**
 * Валідація/нормалізація телефону відповідно до PhonePolicy
 * (`authPhonePolicy` / `deliveryPhonePolicy`).
 * Повертає нормалізований E.164 номер або null, якщо номер не відповідає політиці.
 *
 * `regionFallback`: when policy is `intl` and the user typed a national number (0…),
 * apply that deploy's country code (SK → +421, UA → +380) instead of inventing UA always.
 */
export function validatePhoneForPolicy(
  phone: string,
  policy: PhonePolicy,
  regionFallback?: MarketRegion,
): string | null {
  const trimmed = phone.trim()
  if (!trimmed) return null

  if (policy === 'sk_e164') return normalizePhoneSkE164(trimmed)
  if (policy === 'ua_e164') return normalizePhoneE164(trimmed)

  const intl = normalizeIntlPhone(trimmed)
  if (intl) return intl

  if (regionFallback === 'sk') return normalizePhoneSkE164(trimmed)
  if (regionFallback === 'ua') return normalizePhoneE164(trimmed)
  return null
}
