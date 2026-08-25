import {
  adresarRefFromRow,
  buildTaxIdCandidates,
  normalizeAdresarEmail,
  stableCustomerEmailExtId,
  stableSupplierExtId,
} from './flexi-adresar-lookup'

describe('buildTaxIdCandidates', () => {
  it('expands PL VAT into prefixed and digits-only forms', () => {
    const c = buildTaxIdCandidates({ vatId: 'PL 5542684776' })
    expect(c).toContain('PL5542684776')
    expect(c).toContain('5542684776')
  })

  it('adds country hint to bare IČO', () => {
    const c = buildTaxIdCandidates({ ico: '5542684776', countryHint: 'PL' })
    expect(c).toContain('5542684776')
    expect(c).toContain('PL5542684776')
  })
})

describe('stable ids', () => {
  it('builds stable supplier ext from digits', () => {
    expect(stableSupplierExtId(['PL5542684776'])).toBe('ext:GA:SUP:5542684776')
  })

  it('normalizes email and builds cus ext', () => {
    expect(normalizeAdresarEmail('  Foo@Bar.COM ')).toBe('foo@bar.com')
    expect(stableCustomerEmailExtId('foo@bar.com')).toBe('ext:GA:CUS-EMAIL:foo@bar.com')
  })

  it('prefers kod for adresar ref', () => {
    expect(adresarRefFromRow({ kod: 'VITRO', id: 1 })).toBe('code:VITRO')
  })
})
