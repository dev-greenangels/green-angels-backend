import type { NpAutoSyncConfig, NpHumanSchedule } from './nova-poshta.types'
import type { NpSyncTarget } from './nova-poshta.constants'

export const NP_WEEKDAY_LABELS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const

export const DEFAULT_HUMAN_SCHEDULE: NpHumanSchedule = {
  enabled: true,
  hour: 3,
  minute: 0,
  daysOfWeek: [],
  dayOfMonth: 1,
}

export const DEFAULT_AUTO_SYNC_CONFIG: NpAutoSyncConfig = {
  enabled: true,
  mode: 'all',
  schedules: {
    all: { ...DEFAULT_HUMAN_SCHEDULE },
    settlements: { ...DEFAULT_HUMAN_SCHEDULE, dayOfMonth: null },
    warehouses: { ...DEFAULT_HUMAN_SCHEDULE, dayOfMonth: null },
    warehouse_types: { ...DEFAULT_HUMAN_SCHEDULE, dayOfMonth: null },
  },
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

export function normalizeHumanSchedule(
  raw: Partial<NpHumanSchedule> | null | undefined,
  fallback: NpHumanSchedule,
): NpHumanSchedule {
  const days = Array.isArray(raw?.daysOfWeek)
    ? [...new Set(raw.daysOfWeek.map((d) => clampInt(d, 0, 6, -1)).filter((d) => d >= 0))]
    : fallback.daysOfWeek

  const dayOfMonth =
    raw?.dayOfMonth === null
      ? null
      : raw?.dayOfMonth !== undefined
        ? clampInt(raw.dayOfMonth, 1, 31, fallback.dayOfMonth ?? 1)
        : fallback.dayOfMonth

  return {
    enabled: raw?.enabled ?? fallback.enabled,
    hour: clampInt(raw?.hour ?? fallback.hour, 0, 23, fallback.hour),
    minute: clampInt(raw?.minute ?? fallback.minute, 0, 59, fallback.minute),
    daysOfWeek: days,
    dayOfMonth,
  }
}

export function normalizeAutoSyncConfig(
  raw: Partial<NpAutoSyncConfig> | null | undefined,
  legacyCron?: string,
): NpAutoSyncConfig {
  const base = DEFAULT_AUTO_SYNC_CONFIG
  const parsedLegacy = legacyCron?.trim() ? parseCronExpression(legacyCron.trim()) : null

  const mode = raw?.mode === 'separate' ? 'separate' : 'all'
  const legacySchedule = parsedLegacy ?? base.schedules.all

  return {
    enabled: raw?.enabled ?? base.enabled,
    mode,
    schedules: {
      all: normalizeHumanSchedule(raw?.schedules?.all, legacySchedule),
      settlements: normalizeHumanSchedule(raw?.schedules?.settlements, base.schedules.settlements),
      warehouses: normalizeHumanSchedule(raw?.schedules?.warehouses, base.schedules.warehouses),
      warehouse_types: normalizeHumanSchedule(
        raw?.schedules?.warehouse_types,
        base.schedules.warehouse_types,
      ),
    },
  }
}

export function buildCronExpression(schedule: NpHumanSchedule): string {
  const minute = clampInt(schedule.minute, 0, 59, 0)
  const hour = clampInt(schedule.hour, 0, 23, 3)
  const dayOfMonth =
    schedule.dayOfMonth === null ? '*' : String(clampInt(schedule.dayOfMonth, 1, 31, 1))
  const days =
    schedule.daysOfWeek.length > 0
      ? [...new Set(schedule.daysOfWeek)].sort((a, b) => a - b).join(',')
      : '*'

  return `${minute} ${hour} ${dayOfMonth} * ${days}`
}

export function parseCronExpression(cron: string): NpHumanSchedule | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return null

  const minute = Number(parts[0])
  const hour = Number(parts[1])
  const dom = parts[2]
  const dow = parts[4]

  if (!Number.isFinite(minute) || !Number.isFinite(hour)) return null

  const daysOfWeek =
    dow === '*'
      ? []
      : dow
          .split(',')
          .map((part) => Number(part.trim()))
          .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6)

  return normalizeHumanSchedule(
    {
      enabled: true,
      minute,
      hour,
      dayOfMonth: dom === '*' ? null : Number(dom),
      daysOfWeek,
    },
    DEFAULT_HUMAN_SCHEDULE,
  )
}

export function formatHumanSchedule(schedule: NpHumanSchedule): string {
  const time = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`
  const parts: string[] = []

  if (schedule.dayOfMonth !== null) {
    parts.push(`${schedule.dayOfMonth}-го числа`)
  }

  if (schedule.daysOfWeek.length > 0) {
    parts.push(schedule.daysOfWeek.map((d) => NP_WEEKDAY_LABELS[d] ?? String(d)).join(', '))
  } else if (schedule.dayOfMonth === null) {
    parts.push('щодня')
  }

  return `${time} · ${parts.join(' · ') || 'щомісяця'}`
}

export function autoSyncTargets(config: NpAutoSyncConfig): NpSyncTarget[] {
  if (!config.enabled) return []
  if (config.mode === 'all') {
    return config.schedules.all.enabled ? ['all'] : []
  }

  return (['settlements', 'warehouses', 'warehouse_types'] as const).filter(
    (target) => config.schedules[target].enabled,
  )
}

export function cronForAutoSyncTarget(
  config: NpAutoSyncConfig,
  target: NpSyncTarget,
): string | null {
  if (!config.enabled) return null
  if (config.mode === 'all') {
    return config.schedules.all.enabled ? buildCronExpression(config.schedules.all) : null
  }
  if (target === 'all') return null
  const schedule = config.schedules[target]
  return schedule.enabled ? buildCronExpression(schedule) : null
}
