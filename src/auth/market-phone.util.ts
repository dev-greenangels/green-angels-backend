import type { PhonePolicy } from '../settings/market.types'
import { normalizeIntlPhone, normalizePhoneE164, normalizePhoneSkE164 } from './auth.utils'

/**
 * Валідація/нормалізація телефону відповідно до PhonePolicy
 * (`authPhonePolicy` / `deliveryPhonePolicy`).
 * Повертає нормалізований E.164 номер або null, якщо номер не відповідає політиці.
 */
export function validatePhoneForPolicy(phone: string, policy: PhonePolicy): string | null {
  const trimmed = phone.trim()
  if (!trimmed) return null

  if (policy === 'sk_e164') return normalizePhoneSkE164(trimmed)
  if (policy === 'intl') return normalizeIntlPhone(trimmed)
  return normalizePhoneE164(trimmed)
}
