import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isAccountWithdrawalActionVisible } from './contract-withdrawal-eligibility'

describe('isAccountWithdrawalActionVisible', () => {
  const settings = { accountWithdrawalWindowDays: 14 }

  it('hides when backstage override disabled', () => {
    assert.equal(
      isAccountWithdrawalActionVisible(
        {
          onlineWithdrawalActionEnabled: false,
          deliveredAt: new Date('2026-08-01'),
          status: 'DELIVERED',
          cancelledAt: null,
          buyerType: 'individual',
        },
        settings,
      ),
      false,
    )
  })

  it('shows for delivered order within window when deliveredAt is known', () => {
    const deliveredAt = new Date()
    deliveredAt.setUTCDate(deliveredAt.getUTCDate() - 5)
    assert.equal(
      isAccountWithdrawalActionVisible(
        {
          onlineWithdrawalActionEnabled: true,
          deliveredAt,
          status: 'DELIVERED',
          cancelledAt: null,
          buyerType: 'individual',
        },
        settings,
      ),
      true,
    )
  })

  it('hides after window expired when deliveredAt is known', () => {
    const deliveredAt = new Date('2020-01-01')
    assert.equal(
      isAccountWithdrawalActionVisible(
        {
          onlineWithdrawalActionEnabled: true,
          deliveredAt,
          status: 'DELIVERED',
          cancelledAt: null,
          buyerType: 'individual',
        },
        settings,
      ),
      false,
    )
  })

  it('shows for fulfillment-relevant status when deliveredAt is null (no expiry inference)', () => {
    assert.equal(
      isAccountWithdrawalActionVisible(
        {
          onlineWithdrawalActionEnabled: true,
          deliveredAt: null,
          status: 'DELIVERED',
          cancelledAt: null,
          buyerType: 'individual',
        },
        settings,
      ),
      true,
    )
    assert.equal(
      isAccountWithdrawalActionVisible(
        {
          onlineWithdrawalActionEnabled: true,
          deliveredAt: null,
          status: 'SHIPPED',
          cancelledAt: null,
          buyerType: 'individual',
        },
        settings,
      ),
      true,
    )
  })

  it('hides unpaid orders even when deliveredAt is null', () => {
    assert.equal(
      isAccountWithdrawalActionVisible(
        {
          onlineWithdrawalActionEnabled: true,
          deliveredAt: null,
          status: 'AWAITING_PAYMENT',
          cancelledAt: null,
          buyerType: 'individual',
        },
        settings,
      ),
      false,
    )
  })

  it('hides B2B company orders', () => {
    assert.equal(
      isAccountWithdrawalActionVisible(
        {
          onlineWithdrawalActionEnabled: true,
          deliveredAt: new Date(),
          status: 'DELIVERED',
          cancelledAt: null,
          buyerType: 'company',
        },
        settings,
      ),
      false,
    )
  })
})
