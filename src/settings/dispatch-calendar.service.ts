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

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`)
}

function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIsoDate(d)
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

  async resolveEarliestDate(input: {
    availableFromDates?: Array<string | null | undefined>
    today?: Date
  }): Promise<string> {
    const settings = await this.getSettings()
    const today = input.today ?? new Date()
    let earliest = addDays(toIsoDate(today), settings.minLeadDays)
    for (const raw of input.availableFromDates ?? []) {
      if (!raw?.trim()) continue
      const iso = raw.trim().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue
      if (iso > earliest) earliest = iso
    }
    return earliest
  }

  private isOpenDay(iso: string, settings: DispatchCalendarSettings): boolean {
    const weekday = parseIsoDate(iso).getUTCDay()
    if (settings.blockedWeekdays.includes(weekday)) return false
    if (settings.blackoutDates.includes(iso)) return false
    return true
  }

  async countSiteOrdersForDate(iso: string): Promise<number> {
    const start = parseIsoDate(iso)
    const end = parseIsoDate(addDays(iso, 1))
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
  }): Promise<DispatchAvailableDate[]> {
    const settings = await this.getSettings()
    if (!settings.enabled) return []

    const earliest =
      input.earliest ??
      (await this.resolveEarliestDate({ availableFromDates: input.availableFromDates }))

    const candidates: string[] = []
    for (let i = 0; i <= settings.horizonDays; i++) {
      const iso = addDays(earliest, i)
      if (this.isOpenDay(iso, settings)) candidates.push(iso)
    }
    if (candidates.length === 0) return []

    const start = parseIsoDate(candidates[0]!)
    const end = parseIsoDate(addDays(candidates[candidates.length - 1]!, 1))
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

  async getCapacityReport(): Promise<DispatchDaySlot[]> {
    const settings = await this.getSettings()
    const earliest = await this.resolveEarliestDate({})
    const report: DispatchDaySlot[] = []
    for (let i = 0; i <= settings.horizonDays; i++) {
      const iso = addDays(earliest, i)
      if (!this.isOpenDay(iso, settings)) continue
      report.push(await this.getDaySlot(iso, settings))
    }
    return report
  }

  async assertDateAvailable(iso: string, availableFromDates?: string[]): Promise<void> {
    const settings = await this.getSettings()
    if (!settings.enabled) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      throw new Error('Некоректна дата відправки.')
    }
    const earliest = await this.resolveEarliestDate({ availableFromDates })
    if (iso < earliest) {
      throw new Error('Обрана дата відправки раніше доступності товарів.')
    }
    if (!this.isOpenDay(iso, settings)) {
      throw new Error('Обрана дата відправки недоступна (вихідний / свято).')
    }
    const slot = await this.getDaySlot(iso, settings)
    if (settings.dailyCapacity > 0 && (slot.remaining ?? 0) <= 0) {
      throw new Error('Ліміт відправок на цей день вичерпано. Оберіть іншу дату.')
    }
  }
}

export { DEFAULT_DISPATCH_CALENDAR_SETTINGS }
