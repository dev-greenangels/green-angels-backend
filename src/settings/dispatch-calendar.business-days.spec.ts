import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DispatchCalendarService,
  addOpenBusinessDaysIso,
  resolveMarketTimeZone,
  toIsoDateInTimeZone,
} from './dispatch-calendar.service'
import { DEFAULT_DISPATCH_CALENDAR_SETTINGS } from './dispatch-calendar.types'

const DEFAULT_WEEKEND = { blockedWeekdays: [0, 6], blackoutDates: [] as string[] }

describe('addOpenBusinessDaysIso — weekends', () => {
  it('n=0 returns the same date unchanged', () => {
    assert.equal(addOpenBusinessDaysIso('2026-09-25', 0, DEFAULT_WEEKEND), '2026-09-25')
  })

  it('skips a Sat/Sun weekend: Fri +1 business day → Mon', () => {
    // 2026-09-25 = Friday
    assert.equal(addOpenBusinessDaysIso('2026-09-25', 1, DEFAULT_WEEKEND), '2026-09-28')
  })

  it('counts multiple business days across a weekend: Fri +3 → Wed', () => {
    assert.equal(addOpenBusinessDaysIso('2026-09-25', 3, DEFAULT_WEEKEND), '2026-09-30')
  })

  it('starting mid-week stays mid-week when no weekend is crossed', () => {
    // 2026-09-29 = Tuesday, +2 business days → Thursday 2026-10-01
    assert.equal(addOpenBusinessDaysIso('2026-09-29', 2, DEFAULT_WEEKEND), '2026-10-01')
  })

  it('custom blockedWeekdays: only Sunday blocked → Saturday counts as open', () => {
    // 2026-09-25 = Friday, +1 with only Sunday blocked → Saturday 2026-09-26
    assert.equal(
      addOpenBusinessDaysIso('2026-09-25', 1, { blockedWeekdays: [0], blackoutDates: [] }),
      '2026-09-26',
    )
  })
})

describe('addOpenBusinessDaysIso — blackout dates', () => {
  it('skips a blacked-out weekday in addition to weekends', () => {
    // 2026-09-25 Fri +1 business day: Mon 2026-09-28 is blacked out → lands on Tue 2026-09-29
    assert.equal(
      addOpenBusinessDaysIso('2026-09-25', 1, {
        blockedWeekdays: [0, 6],
        blackoutDates: ['2026-09-28'],
      }),
      '2026-09-29',
    )
  })

  it('skips consecutive blackout dates', () => {
    assert.equal(
      addOpenBusinessDaysIso('2026-09-25', 1, {
        blockedWeekdays: [0, 6],
        blackoutDates: ['2026-09-28', '2026-09-29'],
      }),
      '2026-09-30',
    )
  })

  it('blackout on a weekend day (already excluded) does not change the result', () => {
    assert.equal(
      addOpenBusinessDaysIso('2026-09-25', 1, {
        blockedWeekdays: [0, 6],
        blackoutDates: ['2026-09-26'],
      }),
      '2026-09-28',
    )
  })
})

describe('addOpenBusinessDaysIso — input validation', () => {
  it('throws on a malformed ISO date', () => {
    assert.throws(() => addOpenBusinessDaysIso('09/25/2026', 1, DEFAULT_WEEKEND))
  })

  it('throws on a negative day count', () => {
    assert.throws(() => addOpenBusinessDaysIso('2026-09-25', -1, DEFAULT_WEEKEND))
  })
})

describe('DispatchCalendarService.addOpenBusinessDays (instance, TZ-aware)', () => {
  const service = new DispatchCalendarService({} as never)

  it('accepts an ISO string base date directly', () => {
    assert.equal(
      service.addOpenBusinessDays('2026-09-25', 1, DEFAULT_DISPATCH_CALENDAR_SETTINGS),
      '2026-09-28',
    )
  })

  it('resolves a Date base via the given IANA time zone before adding business days', () => {
    // Local midday UTC Friday stays Friday in both SK and UA zones.
    const base = new Date('2026-09-25T12:00:00.000Z')
    assert.equal(
      service.addOpenBusinessDays(
        base,
        1,
        DEFAULT_DISPATCH_CALENDAR_SETTINGS,
        resolveMarketTimeZone('sk'),
      ),
      '2026-09-28',
    )
    assert.equal(
      service.addOpenBusinessDays(
        base,
        1,
        DEFAULT_DISPATCH_CALENDAR_SETTINGS,
        resolveMarketTimeZone('ua'),
      ),
      '2026-09-28',
    )
  })
})

describe('resolveMarketTimeZone', () => {
  it('maps ua → Europe/Kyiv and everything else → Europe/Bratislava', () => {
    assert.equal(resolveMarketTimeZone('ua'), 'Europe/Kyiv')
    assert.equal(resolveMarketTimeZone('sk'), 'Europe/Bratislava')
    assert.equal(resolveMarketTimeZone(null), 'Europe/Bratislava')
    assert.equal(resolveMarketTimeZone(undefined), 'Europe/Bratislava')
  })
})

describe('toIsoDateInTimeZone', () => {
  it('formats a UTC instant into the local calendar date for the given zone', () => {
    // 23:30 UTC on 2026-09-29 is already 2026-09-30 in Kyiv (UTC+3).
    const instant = new Date('2026-09-29T23:30:00.000Z')
    assert.equal(toIsoDateInTimeZone(instant, 'Europe/Kyiv'), '2026-09-30')
    assert.equal(toIsoDateInTimeZone(instant, 'UTC'), '2026-09-29')
  })
})
