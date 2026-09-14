import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guardrail: website hard-delete must stay Flexi-free (local DB cleanup only).
 */
describe('OrdersService.remove Flexi isolation', () => {
  it('remove() source does not call FlexiService export/storno/client', () => {
    const src = readFileSync(join(__dirname, 'orders.service.ts'), 'utf8')
    const removeStart = src.indexOf('async remove(')
    assert.ok(removeStart > 0, 'remove() must exist')
    const nextMethod = src.indexOf('\n  async ', removeStart + 1)
    const body = src.slice(removeStart, nextMethod > 0 ? nextMethod : undefined)

    assert.match(body, /promoCodeUsage\.deleteMany/)
    assert.match(body, /order\.delete/)
    assert.match(body, /removeExportOrderJob/)
    assert.doesNotMatch(body, /\.exportOrder\(/)
    assert.doesNotMatch(body, /\.stornoOrder\(/)
    assert.doesNotMatch(body, /applyRel003CancelSideEffects/)
    assert.doesNotMatch(body, /this\.flexi\./)
  })
})
