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
}

export const DEFAULT_DISPATCH_CALENDAR_SETTINGS: DispatchCalendarSettings = {
  enabled: false,
  blockedWeekdays: [0, 6],
  blackoutDates: [],
  horizonDays: 45,
  minLeadDays: 0,
  dailyCapacity: 100,
  externalReservedByDate: {},
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
