import {
  DEFAULT_DISPATCH_CALENDAR_SETTINGS,
  type DispatchCalendarSettings,
} from './dispatch-calendar.types'

function asWeekdayList(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return [...fallback]
  const next = value
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  return [...new Set(next)].sort((a, b) => a - b)
}

function asDateList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .map((v) => String(v ?? '').trim())
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ),
  ].sort()
}

function asExternalMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) continue
    out[key] = Math.trunc(n)
  }
  return out
}

export function normalizeDispatchCalendarSettings(
  raw: Partial<DispatchCalendarSettings> | null | undefined,
): DispatchCalendarSettings {
  const base = { ...DEFAULT_DISPATCH_CALENDAR_SETTINGS, ...raw }
  const horizon = Number(base.horizonDays)
  const lead = Number(base.minLeadDays)
  const capacity = Number(base.dailyCapacity)
  return {
    enabled: Boolean(base.enabled),
    blockedWeekdays: asWeekdayList(base.blockedWeekdays, DEFAULT_DISPATCH_CALENDAR_SETTINGS.blockedWeekdays),
    blackoutDates: asDateList(base.blackoutDates ?? raw?.blackoutDates),
    horizonDays: Number.isFinite(horizon) ? Math.max(7, Math.min(180, Math.trunc(horizon))) : 45,
    minLeadDays: Number.isFinite(lead) ? Math.max(0, Math.min(30, Math.trunc(lead))) : 0,
    dailyCapacity: Number.isFinite(capacity) ? Math.max(0, Math.trunc(capacity)) : 100,
    externalReservedByDate: asExternalMap(base.externalReservedByDate),
  }
}
