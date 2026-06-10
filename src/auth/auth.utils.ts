import { Role } from '@prisma/client'

import type { ApiUserRole } from './auth.constants'

export function roleFromEmail(email: string): ApiUserRole {
  return email.toLowerCase().includes('admin') ? 'admin' : 'customer'
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
