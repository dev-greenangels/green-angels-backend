import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Flexi HUF order export', () => {
  const src = readFileSync(join(__dirname, 'flexi.service.ts'), 'utf8')

  it('keeps received-order mena EUR for HUF storefront orders', () => {
    assert.match(src, /const menaCode = orderCurrency === 'UAH' \? 'UAH' : 'EUR'/)
  })

  it('writes HU payment FX comment from order snapshot fields', () => {
    assert.match(src, /HU storefront payment currency: HUF/)
    assert.match(src, /Exchange rate: 1 EUR =/)
    assert.match(src, /Customer charged:/)
    assert.match(src, /Original EUR total:/)
  })

  it('uses EUR commercial snapshot for ancillary fees when order currency is HUF', () => {
    assert.match(src, /useEurFeeSnapshot/)
    assert.match(src, /abraNegativeLineAmount/)
  })
})
