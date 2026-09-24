export type DispatchCalendarSettings = {
  enabled: boolean
  /** Weekdays when dispatch is forbidden. 0=Sun … 6=Sat. Default Sat+Sun. */
  blockedWeekdays: number[]
  /** Holiday / unplanned closures YYYY-MM-DD */
  blackoutDates: string[]
  horizonDays: number
  minLeadDays: number
  /** Max orders per day; 0 = unlimited */
  dailyCapacity: number
  /** Manual overlay for orders counted in 1C (no API yet) */
  externalReservedByDate: Record<string, number>
  /**
   * Checkout / success notice about typical dispatch lead time.
   * CMS texts per storefront locale (uk/en/sk/cs/hu/de) — not next-intl.
   */
  shippingLeadNotice: ShippingLeadNoticeSettings
}

export type ShippingLeadNoticeShowMode =
  | 'when_calendar_off'
  | 'always'
  | 'with_calendar'

export type ShippingLeadNoticeSettings = {
  enabled: boolean
  /**
   * when_calendar_off — show only if date picker is disabled
   * with_calendar — show only when date picker is enabled
   * always — show together with or without the calendar
   */
  showMode: ShippingLeadNoticeShowMode
  /** Locale → text. Empty string = fall back to uk then en. */
  texts: Record<string, string>
}

export const SHIPPING_LEAD_NOTICE_LOCALES = [
  'uk',
  'en',
  'sk',
  'cs',
  'hu',
  'de',
] as const

export const DEFAULT_SHIPPING_LEAD_NOTICE_TEXTS: Record<
  (typeof SHIPPING_LEAD_NOTICE_LOCALES)[number],
  string
> = {
  uk: 'Відправка замовлення зазвичай протягом 1–3 робочих днів після підтвердження.',
  en: 'Orders are usually dispatched within 1–3 business days after confirmation.',
  sk: 'Objednávku zvyčajne odosielame do 1–3 pracovných dní po potvrdení.',
  cs: 'Objednávku obvykle odesíláme do 1–3 pracovních dnů po potvrzení.',
  hu: 'A rendelést általában a visszaigazolástól számított 1–3 munkanapon belül feladjuk.',
  de: 'Bestellungen werden in der Regel innerhalb von 1–3 Werktagen nach Bestätigung versendet.',
}

export const DEFAULT_SHIPPING_LEAD_NOTICE: ShippingLeadNoticeSettings = {
  enabled: false,
  showMode: 'when_calendar_off',
  texts: { ...DEFAULT_SHIPPING_LEAD_NOTICE_TEXTS },
}

export const DEFAULT_DISPATCH_CALENDAR_SETTINGS: DispatchCalendarSettings = {
  enabled: false,
  blockedWeekdays: [0, 6],
  blackoutDates: [],
  horizonDays: 45,
  minLeadDays: 0,
  dailyCapacity: 100,
  externalReservedByDate: {},
  shippingLeadNotice: { ...DEFAULT_SHIPPING_LEAD_NOTICE, texts: { ...DEFAULT_SHIPPING_LEAD_NOTICE_TEXTS } },
}

export type DispatchDaySlot = {
  date: string
  siteCount: number
  externalReserved: number
  used: number
  capacity: number
  remaining: number | null
}

export type DispatchAvailableDate = {
  date: string
  remaining: number | null
}
