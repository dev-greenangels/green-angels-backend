import { Role } from '@prisma/client'

import type { ApiUserRole } from './auth.constants'

export function roleFromEmail(_email: string): ApiUserRole {
  return 'customer'
}

export function prismaRoleToApi(role: Role): ApiUserRole {
  return role === Role.ADMIN || role === Role.MANAGER ? 'admin' : 'customer'
}

export function apiRoleToPrisma(role: ApiUserRole): Role {
  return role === 'admin' ? Role.ADMIN : Role.USER
}

/** Нормалізація UA телефону до E.164 (+380XXXXXXXXX). Only for `ua_e164` policy. */
export function normalizePhoneE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('380') && digits.length === 12) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 10) return `+38${digits}`
  if (digits.length === 9) return `+380${digits}`
  if (digits.startsWith('380') && digits.length > 12) return `+${digits.slice(0, 12)}`
  return null
}

/** Формат номера для TurboSMS API (digits only). */
export function phoneE164ToTurboSms(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** Нормалізація SK телефону до E.164 (+421XXXXXXXXX). Only for `sk_e164` policy. */
export function normalizePhoneSkE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('421') && digits.length === 12) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 10) return `+421${digits.slice(1)}`
  if (digits.length === 9) return `+421${digits}`
  if (digits.startsWith('421') && digits.length > 12) return `+${digits.slice(0, 12)}`
  return null
}

/**
 * International E.164 — does not invent +380/+421 for bare national numbers.
 * Leading-0 without `+` is rejected (ambiguous across EU markets).
 */
export function normalizeIntlPhone(phone: string): string | null {
  const trimmed = phone.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return null
  if (!trimmed.startsWith('+') && digits.startsWith('0')) return null
  return `+${digits}`
}

/**
 * Lookup / already-stored numbers: preserve `+…` as intl; never force UA on SK/EU.
 * Bare national without `+` still needs a policy via `validatePhoneForPolicy`.
 */
export function normalizeStoredPhoneE164(phone: string): string | null {
  const trimmed = phone.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('+')) return normalizeIntlPhone(trimmed) ?? `+${trimmed.replace(/\D/g, '')}`
  const digits = trimmed.replace(/\D/g, '')
  if (digits.startsWith('380')) return normalizePhoneE164(trimmed)
  if (digits.startsWith('421')) return normalizePhoneSkE164(trimmed)
  return normalizeIntlPhone(trimmed)
}
