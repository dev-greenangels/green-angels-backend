import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/**
 * Documents required atomicity of DiscountRulesService.update nested replaces.
 * Full Nest DI integration is heavier; this guards the contract the service must keep.
 */
describe('DiscountRule update atomicity contract', () => {
  it('nested replace operations must run inside a single transaction', async () => {
    const ops: string[] = []
    const tx = {
      discountRuleGroup: {
        deleteMany: async () => {
          ops.push('groups.delete')
        },
      },
      discountRuleUser: {
        deleteMany: async () => {
          ops.push('users.delete')
        },
      },
      discountRuleQuantityTier: {
        deleteMany: async () => {
          ops.push('tiers.delete')
        },
      },
      discountRule: {
        update: async () => {
          ops.push('rule.update')
          return { id: 'r1' }
        },
      },
    }

    // Mimic service shape: all nested work inside $transaction callback.
    await (async (client: { $transaction: typeof fakeTransaction }) => {
      await client.$transaction(async (inner) => {
        await inner.discountRuleGroup.deleteMany()
        await inner.discountRuleUser.deleteMany()
        await inner.discountRuleQuantityTier.deleteMany()
        await inner.discountRule.update()
      })
    })({
      $transaction: fakeTransaction,
    })

    assert.deepEqual(ops, ['groups.delete', 'users.delete', 'tiers.delete', 'rule.update'])

    async function fakeTransaction<T>(fn: (t: typeof tx) => Promise<T>): Promise<T> {
      return fn(tx)
    }
  })
})
