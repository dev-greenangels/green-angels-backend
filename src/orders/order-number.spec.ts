import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  calendarYearInTimeZone,
  computeOrderNumberCounterBootstrap,
  decodeYearlyOrderNumber,
  encodeYearlyOrderNumber,
  formatOrderNumber,
  isYearlyEncodedOrderNumber,
  mergeBootstrapLastSeq,
  parseOrderNumberInput,
  sequenceIssuedHighWater,
  variableSymbolFromOrderNumber,
} from './order-number'

describe('order-number helpers', () => {
  it('formats legacy and yearly display numbers', () => {
    assert.equal(formatOrderNumber(74), 'ZY-00000074')
    assert.equal(formatOrderNumber(20260075), 'ZY-20260075')
    assert.equal(formatOrderNumber(2026), 'ZY-00002026')
  })

  it('variable symbols preserve legacy vs yearly semantics', () => {
    assert.equal(variableSymbolFromOrderNumber(74), '74')
    assert.equal(variableSymbolFromOrderNumber(20260075), '20260075')
    assert.equal(variableSymbolFromOrderNumber(2026), '2026')
  })

  it('does not treat legacy 2026 as yearly 2026 encoding', () => {
    assert.equal(isYearlyEncodedOrderNumber(2026), false)
    assert.equal(decodeYearlyOrderNumber(2026), null)
    assert.deepEqual(decodeYearlyOrderNumber(20260001), { year: 2026, seq: 1 })
    assert.equal(encodeYearlyOrderNumber(2026, 75), 20260075)
  })

  it('parses ZY display and bare digits', () => {
    assert.equal(parseOrderNumberInput('ZY-00000074'), 74)
    assert.equal(parseOrderNumberInput('ZY-20260075'), 20260075)
    assert.equal(parseOrderNumberInput('20260075'), 20260075)
    assert.equal(parseOrderNumberInput('74'), 74)
    assert.equal(parseOrderNumberInput(''), null)
  })

  it('resolves calendar year in Bratislava and Kyiv', () => {
    // 2026-12-31 23:30 UTC = 2027-01-01 00:30 Bratislava (CET+1)
    const nyeUtc = new Date('2026-12-31T23:30:00.000Z')
    assert.equal(calendarYearInTimeZone(nyeUtc, 'Europe/Bratislava'), 2027)
    assert.equal(calendarYearInTimeZone(nyeUtc, 'Europe/Kyiv'), 2027)

    // Still 2026 in both at 21:30 UTC on Dec 31 (22:30 Bratislava / 23:30 Kyiv winter)
    const late2026 = new Date('2026-12-31T21:30:00.000Z')
    assert.equal(calendarYearInTimeZone(late2026, 'Europe/Bratislava'), 2026)
    assert.equal(calendarYearInTimeZone(late2026, 'Europe/Kyiv'), 2026)

    // ~1h window: Kyiv already 2027, Bratislava still 2026 (migration TZ risk for UA)
    const kyivAhead = new Date('2026-12-31T22:30:00.000Z')
    assert.equal(calendarYearInTimeZone(kyivAhead, 'Europe/Bratislava'), 2026)
    assert.equal(calendarYearInTimeZone(kyivAhead, 'Europe/Kyiv'), 2027)
  })

  it('maps unused sequence (is_called=false) to issued high-water 0', () => {
    assert.equal(sequenceIssuedHighWater(1, false), 0)
    assert.equal(sequenceIssuedHighWater(1, true), 1)
    assert.equal(sequenceIssuedHighWater(63, true), 63)
    assert.equal(sequenceIssuedHighWater(100, false), 99)
  })

  it('empty DB bootstrap → first order ZY-20260001', () => {
    const issued = sequenceIssuedHighWater(1, false)
    const result = computeOrderNumberCounterBootstrap({
      year: 2026,
      maxOrderNumber: 0,
      sequenceLastValue: issued,
      maxOrderNumberInYear: 0,
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.lastSeq, 0)
      assert.equal(encodeYearlyOrderNumber(2026, result.lastSeq + 1), 20260001)
      assert.equal(formatOrderNumber(20260001), 'ZY-20260001')
    }
  })

  it('legacy orders 1–63 → next ZY-20260064 when sequence does not lead', () => {
    const issued = sequenceIssuedHighWater(63, true)
    const result = computeOrderNumberCounterBootstrap({
      year: 2026,
      maxOrderNumber: 63,
      sequenceLastValue: issued,
      maxOrderNumberInYear: 0,
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.lastSeq, 63)
      assert.equal(encodeYearlyOrderNumber(2026, result.lastSeq + 1), 20260064)
      assert.equal(formatOrderNumber(20260064), 'ZY-20260064')
      assert.equal(variableSymbolFromOrderNumber(20260064), '20260064')
    }
  })

  it('bootstraps 2026 from legacy MAX continuing sequence', () => {
    const result = computeOrderNumberCounterBootstrap({
      year: 2026,
      maxOrderNumber: 74,
      sequenceLastValue: 74,
      maxOrderNumberInYear: 0,
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.lastSeq, 74)
      assert.equal(result.source, 'legacy_continue')
      assert.equal(encodeYearlyOrderNumber(2026, result.lastSeq + 1), 20260075)
    }
  })

  it('bootstraps using GREATEST(max, sequence) when sequence is ahead', () => {
    const result = computeOrderNumberCounterBootstrap({
      year: 2026,
      maxOrderNumber: 63,
      sequenceLastValue: sequenceIssuedHighWater(100, true),
      maxOrderNumberInYear: 0,
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.lastSeq, 100)
      assert.equal(encodeYearlyOrderNumber(2026, result.lastSeq + 1), 20260101)
    }
  })

  it('re-bootstrap never decreases lastSeq (GREATEST upsert)', () => {
    const bootstrapped = computeOrderNumberCounterBootstrap({
      year: 2026,
      maxOrderNumber: 63,
      sequenceLastValue: 63,
      maxOrderNumberInYear: 0,
    })
    assert.equal(bootstrapped.ok, true)
    if (!bootstrapped.ok) return

    assert.equal(mergeBootstrapLastSeq(null, bootstrapped.lastSeq), 63)
    assert.equal(mergeBootstrapLastSeq(63, bootstrapped.lastSeq), 63)
    assert.equal(mergeBootstrapLastSeq(80, bootstrapped.lastSeq), 80)
    assert.equal(mergeBootstrapLastSeq(50, bootstrapped.lastSeq), 63)
  })

  it('bootstraps from existing yearly rows', () => {
    const result = computeOrderNumberCounterBootstrap({
      year: 2026,
      maxOrderNumber: 20260080,
      sequenceLastValue: 0,
      maxOrderNumberInYear: 20260080,
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.lastSeq, 80)
      assert.equal(result.source, 'yearly_existing')
    }
  })

  it('starts 2027 at 0 when only 2026 yearly numbers exist', () => {
    const result = computeOrderNumberCounterBootstrap({
      year: 2027,
      maxOrderNumber: 20260099,
      sequenceLastValue: 0,
      maxOrderNumberInYear: 0,
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.lastSeq, 0)
      assert.equal(encodeYearlyOrderNumber(2027, 1), 20270001)
    }
  })

  it('fails closed when legacy ceiling exceeds 9999', () => {
    const result = computeOrderNumberCounterBootstrap({
      year: 2026,
      maxOrderNumber: 12_000,
      sequenceLastValue: 12_000,
      maxOrderNumberInYear: 0,
    })
    assert.equal(result.ok, false)
  })
})
