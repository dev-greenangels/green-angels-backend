import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizeNbsDate, parseNbsEurHufRateFromCsv } from './nbs-eur-huf-rate'

describe('parseNbsEurHufRateFromCsv', () => {
  it('reads HUF mid rate from legacy long format (Kód/Kurz)', () => {
    const csv = [
      'Krajina;Mena;Množstvo;Kód;Kurz;Dátum',
      'EMU;euro;1;EUR;1;20.10.2026',
      'Maďarsko;forint;1;HUF;365,420;20.10.2026',
    ].join('\n')
    const r = parseNbsEurHufRateFromCsv(csv)
    assert.equal(r.rate, 365.42)
    assert.equal(r.rateDate, '2026-10-20')
    assert.equal(r.source, 'nbs_ecb')
  })

  it('reads HUF mid rate from current wide NBS format (Dátum;…;HUF;…)', () => {
    const csv = [
      '\uFEFFDátum;USD;JPY;CZK;GBP;HUF;PLN',
      '21.10.2026;1,1234;177,36;24,262;0,83825;365;4,3635',
    ].join('\n')
    const r = parseNbsEurHufRateFromCsv(csv)
    assert.equal(r.rate, 365)
    assert.equal(r.rateDate, '2026-10-21')
    assert.equal(r.source, 'nbs_ecb')
  })

  it('parses quoted HUF cells with spaces', () => {
    const csv = ['Dátum;HUF', '21.10.2026;"1 234,50"'].join('\n')
    const r = parseNbsEurHufRateFromCsv(csv)
    assert.equal(r.rate, 1234.5)
  })

  it('normalizeNbsDate', () => {
    assert.equal(normalizeNbsDate('20.10.2026'), '2026-10-20')
    assert.equal(normalizeNbsDate('2026-10-20T12:00:00Z'), '2026-10-20')
  })
})
