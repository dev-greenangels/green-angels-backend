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
   * Structured shipping SLA (source of truth for shipByDate math).
   * Customer-facing copy stays in shippingLeadNotice.texts — do not parse those texts.
   */
  shippingLeadTimeMinBusinessDays: number
  shippingLeadTimeMaxBusinessDays: number
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
  uk: 'Відправка замовлення зазвичай протягом 2–5 робочих днів після отримання оплати (для післяплати — після підтвердження замовлення).',
  en: 'Orders are usually dispatched within 2–5 business days after payment is received (for COD — after order confirmation).',
  sk: 'Objednávku zvyčajne odosielame do 2–5 pracovných dní od prijatia platby (pri dobierke — po potvrdení objednávky).',
  cs: 'Objednávku obvykle odesíláme do 2–5 pracovních dnů od přijetí platby (u dobírky — po potvrzení objednávky).',
  hu: 'A rendelést általában a fizetés beérkezésétől számított 2–5 munkanapon belül feladjuk (utánvétnél — a megrendelés visszaigazolása után).',
  de: 'Bestellungen werden in der Regel innerhalb von 2–5 Werktagen nach Zahlungseingang versendet (bei Nachnahme — nach Auftragsbestätigung).',
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
  shippingLeadTimeMinBusinessDays: 2,
  shippingLeadTimeMaxBusinessDays: 5,
  shippingLeadNotice: {
    ...DEFAULT_SHIPPING_LEAD_NOTICE,
    texts: { ...DEFAULT_SHIPPING_LEAD_NOTICE_TEXTS },
  },
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
