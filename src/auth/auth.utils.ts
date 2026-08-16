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

/** Нормалізація UA телефону до E.164 (+380XXXXXXXXX). */
export function normalizePhoneE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('380') && digits.length === 12) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 10) return `+38${digits}`
  if (digits.length === 9) return `+380${digits}`
  if (digits.length >= 10) return `+${digits}`
  return null
}

/** Формат номера для TurboSMS API (380XXXXXXXXX). */
export function phoneE164ToTurboSms(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** Нормалізація SK телефону до E.164 (+421XXXXXXXXX). */
export function normalizePhoneSkE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('421') && digits.length === 12) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 10) return `+421${digits.slice(1)}`
  if (digits.length === 9) return `+421${digits}`
  if (digits.length >= 10) return `+${digits}`
  return null
}

/** Мінімальна нормалізація довільного міжнародного номера (лише формат E.164). */
export function normalizeIntlPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return null
  return phone.trim().startsWith('+') ? `+${digits}` : `+${digits}`
}
