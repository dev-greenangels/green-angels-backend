import {
  DEFAULT_DISPATCH_CALENDAR_SETTINGS,
  DEFAULT_SHIPPING_LEAD_NOTICE,
  DEFAULT_SHIPPING_LEAD_NOTICE_TEXTS,
  SHIPPING_LEAD_NOTICE_LOCALES,
  type DispatchCalendarSettings,
  type ShippingLeadNoticeSettings,
  type ShippingLeadNoticeShowMode,
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

const SHOW_MODES = new Set<ShippingLeadNoticeShowMode>([
  'when_calendar_off',
  'always',
  'with_calendar',
])

export function normalizeShippingLeadNotice(
  raw: Partial<ShippingLeadNoticeSettings> | null | undefined,
): ShippingLeadNoticeSettings {
  const showMode = SHOW_MODES.has(raw?.showMode as ShippingLeadNoticeShowMode)
    ? (raw!.showMode as ShippingLeadNoticeShowMode)
    : DEFAULT_SHIPPING_LEAD_NOTICE.showMode
  const textsIn =
    raw?.texts && typeof raw.texts === 'object' && !Array.isArray(raw.texts)
      ? (raw.texts as Record<string, unknown>)
      : {}
  const texts: Record<string, string> = {}
  for (const locale of SHIPPING_LEAD_NOTICE_LOCALES) {
    const fromRaw = String(textsIn[locale] ?? '').trim()
    texts[locale] = fromRaw || DEFAULT_SHIPPING_LEAD_NOTICE_TEXTS[locale]
  }
  // Preserve any extra locale keys that were saved historically.
  for (const [key, value] of Object.entries(textsIn)) {
    if (texts[key] !== undefined) continue
    const t = String(value ?? '').trim()
    if (t) texts[key] = t
  }
  return {
    enabled: raw?.enabled === true,
    showMode,
    texts,
  }
}

/** Resolve notice text for a storefront locale with uk → en fallback. */
export function resolveShippingLeadNoticeText(
  notice: ShippingLeadNoticeSettings | null | undefined,
  locale: string,
): string {
  if (!notice?.enabled) return ''
  const texts = notice.texts ?? {}
  const primary = String(texts[locale] ?? '').trim()
  if (primary) return primary
  const uk = String(texts.uk ?? '').trim()
  if (uk) return uk
  const en = String(texts.en ?? '').trim()
  return en
}

export function shouldShowShippingLeadNotice(
  notice: ShippingLeadNoticeSettings | null | undefined,
  calendarEnabled: boolean,
): boolean {
  if (!notice?.enabled) return false
  switch (notice.showMode) {
    case 'always':
      return true
    case 'with_calendar':
      return calendarEnabled
    case 'when_calendar_off':
    default:
      return !calendarEnabled
  }
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
    blockedWeekdays: asWeekdayList(
      base.blockedWeekdays,
      DEFAULT_DISPATCH_CALENDAR_SETTINGS.blockedWeekdays,
    ),
    blackoutDates: asDateList(base.blackoutDates ?? raw?.blackoutDates),
    horizonDays: Number.isFinite(horizon) ? Math.max(7, Math.min(180, Math.trunc(horizon))) : 45,
    minLeadDays: Number.isFinite(lead) ? Math.max(0, Math.min(30, Math.trunc(lead))) : 0,
    dailyCapacity: Number.isFinite(capacity) ? Math.max(0, Math.trunc(capacity)) : 100,
    externalReservedByDate: asExternalMap(base.externalReservedByDate),
    shippingLeadNotice: normalizeShippingLeadNotice(
      raw?.shippingLeadNotice ?? base.shippingLeadNotice,
    ),
  }
}
