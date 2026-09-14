import {
  ContractWithdrawalRefundMethod,
  ContractWithdrawalStatus,
} from '@prisma/client'

/** Manual ops workflow (tracking only — never calls payment APIs). */
export const MANUAL_REFUND_WORKFLOW: ContractWithdrawalStatus[] = [
  ContractWithdrawalStatus.SUBMITTED,
  ContractWithdrawalStatus.WAITING_FOR_RETURN,
  ContractWithdrawalStatus.RETURN_RECEIVED,
  ContractWithdrawalStatus.REFUND_PENDING,
  ContractWithdrawalStatus.REFUNDED,
]

export type ManualRefundValidationInput = {
  status: ContractWithdrawalStatus
  confirmRefundCompleted?: boolean
  refundAmount?: number | null
  existingRefundAmount?: number | null
  refundCurrency?: string | null
  existingRefundCurrency?: string | null
  refundMethod?: ContractWithdrawalRefundMethod | null
  existingRefundMethod?: ContractWithdrawalRefundMethod | null
}

export type ManualRefundValidationOk = {
  ok: true
  refundAmount: number | null
  refundCurrency: string | null
  refundMethod: ContractWithdrawalRefundMethod | null
  setReturnReceivedAt: boolean
  setRefundedAt: boolean
}

export type ManualRefundValidationErr = {
  ok: false
  message: string
}

/**
 * Validate backstage status/refund fields. Does not perform monetary refunds.
 */
export function validateManualRefundUpdate(
  input: ManualRefundValidationInput,
  options?: { hadReturnReceivedAt?: boolean },
): ManualRefundValidationOk | ManualRefundValidationErr {
  const setReturnReceivedAt =
    input.status === ContractWithdrawalStatus.RETURN_RECEIVED &&
    !options?.hadReturnReceivedAt

  if (input.status !== ContractWithdrawalStatus.REFUNDED) {
    if (input.refundAmount != null && input.refundAmount < 0) {
      return { ok: false, message: 'Zadajte platnú sumu vrátenia (0 alebo viac).' }
    }
    return {
      ok: true,
      refundAmount: input.refundAmount ?? null,
      refundCurrency: input.refundCurrency?.trim().toUpperCase() || null,
      refundMethod: input.refundMethod ?? null,
      setReturnReceivedAt,
      setRefundedAt: false,
    }
  }

  if (input.confirmRefundCompleted !== true) {
    return {
      ok: false,
      message:
        'Pre stav REFUNDED je potrebné potvrdenie, že platba už bola reálne vrátená zákazníkovi.',
    }
  }

  const amount =
    input.refundAmount ??
    (input.existingRefundAmount != null ? Number(input.existingRefundAmount) : null)
  const currency =
    (input.refundCurrency ?? input.existingRefundCurrency)?.trim().toUpperCase() || null
  const method = input.refundMethod ?? input.existingRefundMethod

  if (amount == null || Number.isNaN(amount) || amount < 0) {
    return { ok: false, message: 'Zadajte platnú sumu vrátenia (0 alebo viac).' }
  }
  if (!currency || currency.length !== 3) {
    return { ok: false, message: 'Zadajte menu vrátenia (ISO 3).' }
  }
  if (!method) {
    return { ok: false, message: 'Zadajte spôsob manuálneho vrátenia platby.' }
  }

  return {
    ok: true,
    refundAmount: amount,
    refundCurrency: currency,
    refundMethod: method,
    setReturnReceivedAt,
    setRefundedAt: true,
  }
}
