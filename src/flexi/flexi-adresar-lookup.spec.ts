import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  adresarRefFromRow,
  adresarRowMatchesTaxCandidates,
  buildAdresarTaxOrFilter,
  buildTaxIdCandidates,
  normalizeAdresarEmail,
  stableCustomerEmailExtId,
  stableCustomerTaxExtId,
  stableSupplierExtId,
  taxIdMatchKeys,
} from './flexi-adresar-lookup'

describe('buildTaxIdCandidates', () => {
  it('expands PL VAT into prefixed and digits-only forms', () => {
    const c = buildTaxIdCandidates({ vatId: 'PL 5542684776' })
    assert.ok(c.includes('PL5542684776'))
    assert.ok(c.includes('5542684776'))
  })

  it('adds country hint to bare IČO', () => {
    const c = buildTaxIdCandidates({ ico: '5542684776', countryHint: 'PL' })
    assert.ok(c.includes('5542684776'))
    assert.ok(c.includes('PL5542684776'))
  })
})

describe('adresar tax match verify', () => {
  const identityEscape = (v: string) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

  it('matches BE VAT row against candidates including digits-only', () => {
    const candidates = buildTaxIdCandidates({ vatId: 'BE0461345559', countryHint: 'BE' })
    assert.equal(
      adresarRowMatchesTaxCandidates(
        { nazev: 'VANDEPUTTE BV', vatId: 'BE0461345559', ic: '0461345559' },
        candidates,
      ),
      true,
    )
  })

  it('rejects unrelated first adresar without tax overlap', () => {
    const candidates = buildTaxIdCandidates({ vatId: 'BE0461345559' })
    assert.equal(
      adresarRowMatchesTaxCandidates(
        { nazev: 'Artur Demich', kod: 'AD', ic: '', vatId: '', dic: '' },
        candidates,
      ),
      false,
    )
  })

  it('builds or-filter covering vatId ic dic', () => {
    const filter = buildAdresarTaxOrFilter(['BE0461345559', '0461345559'], identityEscape)
    assert.ok(filter?.includes("vatId='BE0461345559'"))
    assert.ok(filter?.includes("ic='0461345559'"))
    assert.ok(filter?.includes(' or '))
  })

  it('taxIdMatchKeys includes digits for prefixed VAT', () => {
    assert.ok(taxIdMatchKeys('BE0461345559').includes('0461345559'))
    assert.ok(taxIdMatchKeys('BE0461345559').includes('BE0461345559'))
  })

  it('does not match when Flexi tax fields are object-empty noise', () => {
    const candidates = buildTaxIdCandidates({ vatId: 'BE0461345559' })
    assert.equal(
      adresarRowMatchesTaxCandidates({ nazev: 'Artur Demich', ic: null, vatId: null, dic: '' }, candidates),
      false,
    )
  })
})

describe('stable ids', () => {
  it('builds stable supplier ext from digits', () => {
    assert.equal(stableSupplierExtId(['PL5542684776']), 'ext:GA:SUP:5542684776')
  })

  it('builds stable customer tax ext from digits', () => {
    assert.equal(stableCustomerTaxExtId(['BE0461345559']), 'ext:GA:CUS-TAX:0461345559')
  })

  it('normalizes email and builds cus ext', () => {
    assert.equal(normalizeAdresarEmail('  Foo@Bar.COM '), 'foo@bar.com')
    assert.equal(stableCustomerEmailExtId('foo@bar.com'), 'ext:GA:CUS-EMAIL:foo@bar.com')
  })

  it('prefers kod for adresar ref', () => {
    assert.equal(adresarRefFromRow({ kod: 'VITRO', id: 1 }), 'code:VITRO')
  })
})
