export type FlexiScheduleMode = 'daily' | 'weekly' | 'monthly'

export type FlexiFullSyncSchedule = {
  enabled: boolean
  mode: FlexiScheduleMode
  hour: number
  minute: number
  /** 0=Sun … 6=Sat; used when mode=weekly */
  dayOfWeek: number
  /** 1–28; used when mode=monthly */
  dayOfMonth: number
}

export const DEFAULT_FULL_SYNC_SCHEDULE: FlexiFullSyncSchedule = {
  enabled: false,
  mode: 'daily',
  hour: 3,
  minute: 0,
  dayOfWeek: 1,
  dayOfMonth: 1,
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

export function normalizeFullSyncSchedule(
  raw: Partial<FlexiFullSyncSchedule> | null | undefined,
): FlexiFullSyncSchedule {
  const mode =
    raw?.mode === 'weekly' || raw?.mode === 'monthly' || raw?.mode === 'daily'
      ? raw.mode
      : DEFAULT_FULL_SYNC_SCHEDULE.mode
  return {
    enabled: Boolean(raw?.enabled),
    mode,
    hour: clampInt(raw?.hour ?? DEFAULT_FULL_SYNC_SCHEDULE.hour, 0, 23, 3),
    minute: clampInt(raw?.minute ?? DEFAULT_FULL_SYNC_SCHEDULE.minute, 0, 59, 0),
    dayOfWeek: clampInt(raw?.dayOfWeek ?? DEFAULT_FULL_SYNC_SCHEDULE.dayOfWeek, 0, 6, 1),
    dayOfMonth: clampInt(raw?.dayOfMonth ?? DEFAULT_FULL_SYNC_SCHEDULE.dayOfMonth, 1, 28, 1),
  }
}

/** BullMQ / node-cron 5-field: m h dom mon dow */
export function buildFullSyncCron(schedule: FlexiFullSyncSchedule): string | null {
  if (!schedule.enabled) return null
  const m = schedule.minute
  const h = schedule.hour
  if (schedule.mode === 'daily') return `${m} ${h} * * *`
  if (schedule.mode === 'weekly') return `${m} ${h} * * ${schedule.dayOfWeek}`
  return `${m} ${h} ${schedule.dayOfMonth} * *`
}

export function formatFullSyncSchedule(schedule: FlexiFullSyncSchedule): string {
  if (!schedule.enabled) return 'вимкнено'
  const time = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`
  const days = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  if (schedule.mode === 'daily') return `щодня о ${time}`
  if (schedule.mode === 'weekly') return `${days[schedule.dayOfWeek] ?? schedule.dayOfWeek} о ${time}`
  return `${schedule.dayOfMonth}-го числа о ${time}`
}
