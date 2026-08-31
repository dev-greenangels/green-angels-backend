import type { StoreContactSettings } from '../settings/settings.constants'
import type {
  WithdrawalReturnAddressMode,
  WithdrawalStructuredAddress,
} from '../settings/withdrawal.types'

export function formatStructuredAddress(address: WithdrawalStructuredAddress): string {
  const lines = [
    address.organizationName,
    address.street,
    [address.postalCode, address.city].filter(Boolean).join(' '),
    address.country,
  ].filter((line) => line.trim().length > 0)
  return lines.join('\n')
}

export function resolveWithdrawalReturnAddress(input: {
  mode: WithdrawalReturnAddressMode
  customAddress: WithdrawalStructuredAddress
  store: StoreContactSettings
}): string {
  if (input.mode === 'custom') {
    const formatted = formatStructuredAddress(input.customAddress)
    if (formatted.trim()) return formatted
  }

  const storeLines = [
    input.store.companyDetails?.organizationName?.trim(),
    input.store.addressLine1?.trim(),
    input.store.addressLine2?.trim(),
  ].filter(Boolean)
  return storeLines.join('\n')
}

export function escapeTemplateValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function fillWithdrawalTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key]
    return value ?? ''
  })
}
