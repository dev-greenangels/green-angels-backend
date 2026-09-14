import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ContractWithdrawalRefundMethod, ContractWithdrawalStatus } from '@prisma/client'

import {
  MANUAL_REFUND_WORKFLOW,
  validateManualRefundUpdate,
} from './contract-withdrawal-manual-refund'
import {
  fillWithdrawalTemplate,
  resolveWithdrawalReturnAddress,
} from './contract-withdrawal-template'
import { resolveWithdrawalAckTemplate } from '../settings/withdrawal.types'
import { DEFAULT_WITHDRAWAL_SETTINGS } from '../settings/withdrawal.types'

describe('manual refund workflow', () => {
  it('lists expected ops statuses', () => {
    assert.deepEqual(MANUAL_REFUND_WORKFLOW, [
      'SUBMITTED',
      'WAITING_FOR_RETURN',
      'RETURN_RECEIVED',
      'REFUND_PENDING',
      'REFUNDED',
    ])
  })

  it('rejects negative refund amount even before REFUNDED', () => {
    const result = validateManualRefundUpdate({
      status: ContractWithdrawalStatus.REFUND_PENDING,
      refundAmount: -1,
    })
    assert.equal(result.ok, false)
  })

  it('requires confirm + amount + currency + method for REFUNDED', () => {
    const missingConfirm = validateManualRefundUpdate({
      status: ContractWithdrawalStatus.REFUNDED,
      refundAmount: 10,
      refundCurrency: 'EUR',
      refundMethod: ContractWithdrawalRefundMethod.BANK_TRANSFER,
    })
    assert.equal(missingConfirm.ok, false)

    const missingCurrency = validateManualRefundUpdate({
      status: ContractWithdrawalStatus.REFUNDED,
      confirmRefundCompleted: true,
      refundAmount: 10,
      refundMethod: ContractWithdrawalRefundMethod.BANK_TRANSFER,
    })
    assert.equal(missingCurrency.ok, false)

    const ok = validateManualRefundUpdate({
      status: ContractWithdrawalStatus.REFUNDED,
      confirmRefundCompleted: true,
      refundAmount: 12.5,
      refundCurrency: 'eur',
      refundMethod: ContractWithdrawalRefundMethod.ORIGINAL_PAYMENT_METHOD,
    })
    assert.equal(ok.ok, true)
    if (ok.ok) {
      assert.equal(ok.setRefundedAt, true)
      assert.equal(ok.refundCurrency, 'EUR')
      assert.equal(ok.refundAmount, 12.5)
    }
  })

  it('sets returnReceivedAt only on RETURN_RECEIVED when missing', () => {
    const first = validateManualRefundUpdate(
      { status: ContractWithdrawalStatus.RETURN_RECEIVED },
      { hadReturnReceivedAt: false },
    )
    assert.equal(first.ok, true)
    if (first.ok) assert.equal(first.setReturnReceivedAt, true)

    const again = validateManualRefundUpdate(
      { status: ContractWithdrawalStatus.RETURN_RECEIVED },
      { hadReturnReceivedAt: true },
    )
    assert.equal(again.ok, true)
    if (again.ok) {
      assert.equal(again.setReturnReceivedAt, false)
      assert.equal(again.setRefundedAt, false)
    }
  })

  it('does not set refundedAt for non-REFUNDED statuses', () => {
    const result = validateManualRefundUpdate({
      status: ContractWithdrawalStatus.WAITING_FOR_RETURN,
    })
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.setRefundedAt, false)
  })
})

describe('withdrawal acknowledgement locale', () => {
  it('maps sk/en/hu/de/cs/uk subjects', () => {
    for (const locale of ['sk', 'en', 'hu', 'de', 'cs', 'uk'] as const) {
      const tpl = resolveWithdrawalAckTemplate(
        DEFAULT_WITHDRAWAL_SETTINGS.acknowledgementTemplates,
        locale,
      )
      assert.match(tpl.subject, /\{\{withdrawalReference\}\}/)
      assert.match(tpl.body, /\{\{submittedAt\}\}/)
      assert.match(tpl.body, /\{\{returnAddress\}\}/)
      assert.doesNotMatch(tpl.body, /schválen|approved|genehmigt|jóváhagy|schváleno|схвал/i)
    }
  })

  it('falls back unknown locale to en', () => {
    const tpl = resolveWithdrawalAckTemplate(
      DEFAULT_WITHDRAWAL_SETTINGS.acknowledgementTemplates,
      'xx',
    )
    assert.equal(
      tpl.subject,
      DEFAULT_WITHDRAWAL_SETTINGS.acknowledgementTemplates.en!.subject,
    )
  })
})

describe('return address + template fill', () => {
  it('interpolates returnAddress without leaving raw placeholders', () => {
    const filled = fillWithdrawalTemplate('Addr:\n{{returnAddress}}', {
      returnAddress: 'Line 1\nBratislava',
    })
    assert.equal(filled.includes('{{'), false)
    assert.match(filled, /Bratislava/)
  })

  it('resolves custom return address when set', () => {
    const address = resolveWithdrawalReturnAddress({
      mode: 'custom',
      customAddress: {
        organizationName: 'Green Angels s.r.o.',
        street: 'Test 1',
        city: 'Nitra',
        postalCode: '94901',
        country: 'SK',
      },
      store: {
        addressLine1: 'Store St',
        addressLine2: '',
        companyDetails: { organizationName: 'Store Co' },
      } as never,
    })
    assert.match(address, /Green Angels/)
    assert.match(address, /Nitra/)
  })
})
