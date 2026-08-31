import type { AppLocale } from './localization.types'
import { SUPPORTED_LOCALES } from './localization.types'
import {
  DEFAULT_WITHDRAWAL_SETTINGS,
  DEFAULT_WITHDRAWAL_STRUCTURED_ADDRESS,
  type WithdrawalAcknowledgementTemplate,
  type WithdrawalSettings,
  type WithdrawalStructuredAddress,
} from './withdrawal.types'

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeAddress(raw: unknown): WithdrawalStructuredAddress {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    organizationName:
      asTrimmedString(row.organizationName) || DEFAULT_WITHDRAWAL_STRUCTURED_ADDRESS.organizationName,
    street: asTrimmedString(row.street) || DEFAULT_WITHDRAWAL_STRUCTURED_ADDRESS.street,
    city: asTrimmedString(row.city) || DEFAULT_WITHDRAWAL_STRUCTURED_ADDRESS.city,
    postalCode:
      asTrimmedString(row.postalCode) || DEFAULT_WITHDRAWAL_STRUCTURED_ADDRESS.postalCode,
    country: asTrimmedString(row.country) || DEFAULT_WITHDRAWAL_STRUCTURED_ADDRESS.country,
  }
}

function normalizeTemplate(raw: unknown, fallback: WithdrawalAcknowledgementTemplate): WithdrawalAcknowledgementTemplate {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const subject = asTrimmedString(row.subject) || fallback.subject
  const body = asTrimmedString(row.body) || fallback.body
  return {
    subject: subject.slice(0, 300),
    body: body.slice(0, 8000),
  }
}

function normalizeTemplates(raw: unknown): WithdrawalSettings['acknowledgementTemplates'] {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: WithdrawalSettings['acknowledgementTemplates'] = {}
  for (const locale of [...SUPPORTED_LOCALES]) {
    const fallback =
      DEFAULT_WITHDRAWAL_SETTINGS.acknowledgementTemplates[locale] ??
      DEFAULT_WITHDRAWAL_SETTINGS.acknowledgementTemplates.sk!
    out[locale] = normalizeTemplate(row[locale], fallback)
  }
  return out
}

export function normalizeWithdrawalSettings(raw: unknown): WithdrawalSettings {
  const base =
    raw && typeof raw === 'object' ? ({ ...DEFAULT_WITHDRAWAL_SETTINGS, ...raw } as WithdrawalSettings) : {
        ...DEFAULT_WITHDRAWAL_SETTINGS,
      }
  const mode = base.returnAddressMode === 'custom' ? 'custom' : 'store'
  const windowDays = Number(base.accountWithdrawalWindowDays)
  return {
    returnAddressMode: mode,
    customReturnAddress: normalizeAddress(base.customReturnAddress),
    acknowledgementTemplates: normalizeTemplates(base.acknowledgementTemplates),
    accountWithdrawalWindowDays:
      Number.isFinite(windowDays) && windowDays > 0 && windowDays <= 365
        ? Math.floor(windowDays)
        : DEFAULT_WITHDRAWAL_SETTINGS.accountWithdrawalWindowDays,
  }
}
