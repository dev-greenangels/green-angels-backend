import { Injectable } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { SETTINGS_KEYS } from './settings.constants'
import { normalizeDispatchCalendarSettings } from './dispatch-calendar.normalize'
import {
  DEFAULT_DISPATCH_CALENDAR_SETTINGS,
  type DispatchAvailableDate,
  type DispatchCalendarSettings,
  type DispatchDaySlot,
} from './dispatch-calendar.types'

const CANCELLED_STATUSES = new Set(['CANCELLED', 'CANCELED', 'STORNO'])

/** IANA TZ for deploy market — reusable, not SK-hardcoded into callers. */
export function resolveMarketTimeZone(region: string | null | undefined): string {
  const r = (region ?? '').trim().toLowerCase()
  if (r === 'ua') return 'Europe/Kyiv'
  return 'Europe/Bratislava'
}

export function toIsoDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !d) return date.toISOString().slice(0, 10)
  return `${y}-${m}-${d}`
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`)
}

function addCalendarDays(iso: string, days: number): string {
  const d = parseIsoDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIsoDate(d)
}

function isOpenDayIso(iso: string, settings: DispatchCalendarSettings): boolean {
  const weekday = parseIsoDate(iso).getUTCDay()
  if (settings.blockedWeekdays.includes(weekday)) return false
  if (settings.blackoutDates.includes(iso)) return false
  return true
}

/**
 * Add N open/business days to a calendar date (YYYY-MM-DD), skipping blocked
 * weekdays and blackoutDates. Pure — safe for unit tests.
 */
export function addOpenBusinessDaysIso(
  isoDate: string,
  numberOfDays: number,
  settings: Pick<DispatchCalendarSettings, 'blockedWeekdays' | 'blackoutDates'>,
): string {
  const n = Math.trunc(numberOfDays)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error(`Invalid ISO date: ${isoDate}`)
  }
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid business-day count: ${numberOfDays}`)
  }
  if (n === 0) return isoDate
  let cursor = isoDate
  let remaining = n
  // Safety: never walk forever if every day is blocked.
  for (let guard = 0; guard < 3660 && remaining > 0; guard++) {
    cursor = addCalendarDays(cursor, 1)
    if (isOpenDayIso(cursor, settings as DispatchCalendarSettings)) {
      remaining -= 1
    }
  }
  return cursor
}

@Injectable()
export class DispatchCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  private async readRaw(): Promise<Partial<DispatchCalendarSettings>> {
    const row = await this.prisma.settings.findUnique({
      where: { key: SETTINGS_KEYS.DISPATCH_CALENDAR },
    })
    if (!row?.value?.trim()) return {}
    try {
      return JSON.parse(row.value) as Partial<DispatchCalendarSettings>
    } catch {
      return {}
    }
  }

  async getSettings(): Promise<DispatchCalendarSettings> {
    return normalizeDispatchCalendarSettings(await this.readRaw())
  }

  async updateSettings(
    patch: Partial<DispatchCalendarSettings>,
  ): Promise<DispatchCalendarSettings> {
    const current = await this.getSettings()
    const next = normalizeDispatchCalendarSettings({
      ...current,
      ...patch,
      blackoutDates: patch.blackoutDates ?? current.blackoutDates,
      blockedWeekdays: patch.blockedWeekdays ?? current.blockedWeekdays,
      externalReservedByDate:
        patch.externalReservedByDate !== undefined
          ? patch.externalReservedByDate
          : current.externalReservedByDate,
      shippingLeadNotice: patch.shippingLeadNotice
        ? {
            ...current.shippingLeadNotice,
            ...patch.shippingLeadNotice,
            texts: {
              ...current.shippingLeadNotice.texts,
              ...(patch.shippingLeadNotice.texts ?? {}),
            },
          }
        : current.shippingLeadNotice,
    })
    await this.prisma.settings.upsert({
      where: { key: SETTINGS_KEYS.DISPATCH_CALENDAR },
      create: {
        key: SETTINGS_KEYS.DISPATCH_CALENDAR,
        value: JSON.stringify(next),
      },
      update: { value: JSON.stringify(next) },
    })
    return next
  }

  isOpenDay(iso: string, settings: DispatchCalendarSettings): boolean {
    return isOpenDayIso(iso, settings)
  }

  /**
   * Canonical open-business-day adder. Uses blockedWeekdays + blackoutDates.
   * `base` is interpreted in `timeZone` (default Europe/Bratislava).
   */
  addOpenBusinessDays(
    base: Date | string,
    numberOfDays: number,
    settings: DispatchCalendarSettings,
    timeZone: string = 'Europe/Bratislava',
  ): string {
    const iso =
      typeof base === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(base)
        ? base
        : toIsoDateInTimeZone(base instanceof Date ? base : new Date(base), timeZone)
    return addOpenBusinessDaysIso(iso, numberOfDays, settings)
  }

  /** End of local calendar day for a YYYY-MM-DD in the given TZ, as UTC Date. */
  endOfBusinessDateUtc(isoDate: string, timeZone: string): Date {
    // Approximate: noon UTC of that ISO is already used for open-day math;
    // for deadlines use 23:59:59.999 in local TZ via offset probe.
    const probe = new Date(`${isoDate}T12:00:00.000Z`)
    const localNoon = toIsoDateInTimeZone(probe, timeZone)
    // If probe landed on same ISO, shift to end-of-day by finding UTC instant
    // whose local date is still isoDate and next second rolls over.
    let lo = new Date(`${isoDate}T00:00:00.000Z`).getTime() - 12 * 3600_000
    let hi = new Date(`${isoDate}T00:00:00.000Z`).getTime() + 36 * 3600_000
    let best = lo
    while (hi - lo > 1000) {
      const mid = Math.floor((lo + hi) / 2)
      const midIso = toIsoDateInTimeZone(new Date(mid), timeZone)
      if (midIso <= isoDate) {
        best = mid
        lo = mid
      } else {
        hi = mid
      }
    }
    // Snap to last ms of that local day
    let end = best
    for (let t = best; t < best + 48 * 3600_000; t += 60_000) {
      if (toIsoDateInTimeZone(new Date(t), timeZone) === isoDate) end = t
      else break
    }
    // refine seconds
    for (let t = end; t < end + 120_000; t += 1000) {
      if (toIsoDateInTimeZone(new Date(t), timeZone) === isoDate) end = t
      else break
    }
    void localNoon
    return new Date(end)
  }

  async resolveEarliestDate(input: {
    availableFromDates?: Array<string | null | undefined>
    today?: Date
    timeZone?: string
  }): Promise<string> {
    const settings = await this.getSettings()
    const today = input.today ?? new Date()
    const tz = input.timeZone ?? 'Europe/Bratislava'
    let earliest = addCalendarDays(toIsoDateInTimeZone(today, tz), settings.minLeadDays)
    for (const raw of input.availableFromDates ?? []) {
      if (!raw?.trim()) continue
      const iso = raw.trim().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue
      if (iso > earliest) earliest = iso
    }
    return earliest
  }

  async countSiteOrdersForDate(iso: string): Promise<number> {
    const start = parseIsoDate(iso)
    const end = parseIsoDate(addCalendarDays(iso, 1))
    return this.prisma.order.count({
      where: {
        preferredShipDate: { gte: start, lt: end },
        NOT: { status: { in: [...CANCELLED_STATUSES] } },
      },
    })
  }

  async getDaySlot(iso: string, settings?: DispatchCalendarSettings): Promise<DispatchDaySlot> {
    const cfg = settings ?? (await this.getSettings())
    const siteCount = await this.countSiteOrdersForDate(iso)
    const externalReserved = cfg.externalReservedByDate[iso] ?? 0
    const used = siteCount + externalReserved
    const capacity = cfg.dailyCapacity
    const remaining = capacity > 0 ? Math.max(0, capacity - used) : null
    return { date: iso, siteCount, externalReserved, used, capacity, remaining }
  }

  async listAvailableDates(input: {
    earliest?: string
    availableFromDates?: Array<string | null | undefined>
    timeZone?: string
  }): Promise<DispatchAvailableDate[]> {
    const settings = await this.getSettings()
    if (!settings.enabled) return []

    const earliest =
      input.earliest ??
      (await this.resolveEarliestDate({
        availableFromDates: input.availableFromDates,
        timeZone: input.timeZone,
      }))

    const candidates: string[] = []
    for (let i = 0; i <= settings.horizonDays; i++) {
      const iso = addCalendarDays(earliest, i)
      if (this.isOpenDay(iso, settings)) candidates.push(iso)
    }
    if (candidates.length === 0) return []

    const start = parseIsoDate(candidates[0]!)
    const end = parseIsoDate(addCalendarDays(candidates[candidates.length - 1]!, 1))
    const grouped = await this.prisma.order.groupBy({
      by: ['preferredShipDate'],
      where: {
        preferredShipDate: { gte: start, lt: end },
        NOT: { status: { in: [...CANCELLED_STATUSES] } },
      },
      _count: { _all: true },
    })
    const siteByDate = new Map<string, number>()
    for (const row of grouped) {
      if (!row.preferredShipDate) continue
      siteByDate.set(toIsoDate(row.preferredShipDate), row._count._all)
    }

    const out: DispatchAvailableDate[] = []
    for (const iso of candidates) {
      const siteCount = siteByDate.get(iso) ?? 0
      const externalReserved = settings.externalReservedByDate[iso] ?? 0
      const used = siteCount + externalReserved
      const remaining =
        settings.dailyCapacity > 0 ? Math.max(0, settings.dailyCapacity - used) : null
      if (settings.dailyCapacity > 0 && (remaining ?? 0) <= 0) continue
      out.push({ date: iso, remaining })
    }
    return out
  }

  async getCapacityReport(timeZone?: string): Promise<DispatchDaySlot[]> {
    const settings = await this.getSettings()
    const earliest = await this.resolveEarliestDate({ timeZone })
    const report: DispatchDaySlot[] = []
    for (let i = 0; i <= settings.horizonDays; i++) {
      const iso = addCalendarDays(earliest, i)
      if (!this.isOpenDay(iso, settings)) continue
      report.push(await this.getDaySlot(iso, settings))
    }
    return report
  }

  async assertDateAvailable(
    iso: string,
    availableFromDates?: string[],
    timeZone?: string,
  ): Promise<void> {
    const settings = await this.getSettings()
    if (!settings.enabled) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      throw new Error('Некоректна дата відправки.')
    }
    const earliest = await this.resolveEarliestDate({ availableFromDates, timeZone })
    if (iso < earliest) {
      throw new Error('Обрана дата відправки раніше доступності товарів.')
    }
    if (!this.isOpenDay(iso, settings)) {
      throw new Error('Обрана дата відправки недоступна (вихідний / закрито).')
    }
    const slot = await this.getDaySlot(iso, settings)
    if (settings.dailyCapacity > 0 && (slot.remaining ?? 0) <= 0) {
      throw new Error('На обрану дату немає вільної ємності відправки.')
    }
  }
}

export { DEFAULT_DISPATCH_CALENDAR_SETTINGS }
