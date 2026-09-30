import { AsyncLocalStorage } from 'node:async_hooks'
import { Injectable, Logger } from '@nestjs/common'

import { RedisService } from '../redis/redis.service'
import { FlexiSettingsService } from './flexi.settings.service'

export type FlexiApiUsageCategory =
  | 'catalog'
  | 'live'
  | 'orders'
  | 'checkout'
  | 'fullRefresh'
  | 'other'

const usageCategoryAls = new AsyncLocalStorage<FlexiApiUsageCategory>()

export type FlexiApiUsageSnapshot = {
  source: 'LOCAL'
  /** Site→ABRA REST calls today (UTC day). Not authoritative ABRA license meter. */
  used: number
  limit: number
  percent: number
  dateUtc: string
  breakdown: Record<FlexiApiUsageCategory, number>
  note: string
}

const CATEGORIES: FlexiApiUsageCategory[] = [
  'catalog',
  'live',
  'orders',
  'checkout',
  'fullRefresh',
  'other',
]

/**
 * Local SITE→ABRA REST counter (Redis).
 * Incoming webhooks do not count. Each actual HTTP request (+retries) = +1.
 * Assumption: daily bucket = UTC calendar day (ABRA WUI timezone not exposed via API).
 */
@Injectable()
export class FlexiApiUsageService {
  private readonly logger = new Logger(FlexiApiUsageService.name)

  constructor(
    private readonly redis: RedisService,
    private readonly settings: FlexiSettingsService,
  ) {}

  private dayKey(companyId: string, day = this.utcDay()): string {
    const company = (companyId || 'unknown').slice(0, 80)
    return `flexi:api-usage:${company}:${day}`
  }

  utcDay(now = new Date()): string {
    return now.toISOString().slice(0, 10)
  }

  /** Override path-inferred category for a call tree (e.g. Full Refresh). */
  runWithCategory<T>(category: FlexiApiUsageCategory, fn: () => Promise<T>): Promise<T> {
    return usageCategoryAls.run(category, fn)
  }

  activeCategory(): FlexiApiUsageCategory | undefined {
    return usageCategoryAls.getStore()
  }

  async increment(companyId: string, category: FlexiApiUsageCategory = 'other'): Promise<number> {
    const key = this.dayKey(companyId)
    const field = CATEGORIES.includes(category) ? category : 'other'
    try {
      const pipe = this.redis.client.pipeline()
      pipe.hincrby(key, field, 1)
      pipe.hincrby(key, 'total', 1)
      pipe.expire(key, 60 * 60 * 48)
      const results = await pipe.exec()
      const totalRes = results?.[1]?.[1]
      return typeof totalRes === 'number' ? totalRes : Number(totalRes ?? 0)
    } catch (error) {
      this.logger.warn(
        `api usage incr failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return 0
    }
  }

  async snapshot(companyId: string, limitOverride?: number): Promise<FlexiApiUsageSnapshot> {
    const dateUtc = this.utcDay()
    const settings = await this.settings.getSettings()
    const limit = Math.max(
      1,
      limitOverride ??
        (Number.isFinite(Number((settings as { apiDailyLimit?: number }).apiDailyLimit))
          ? Math.trunc(Number((settings as { apiDailyLimit?: number }).apiDailyLimit))
          : 20_000),
    )
    const breakdown = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<
      FlexiApiUsageCategory,
      number
    >
    let used = 0
    try {
      const raw = await this.redis.client.hgetall(this.dayKey(companyId, dateUtc))
      for (const cat of CATEGORIES) {
        breakdown[cat] = Math.max(0, Number(raw[cat] ?? 0) || 0)
      }
      used = Math.max(0, Number(raw.total ?? 0) || 0)
      if (used === 0) {
        used = CATEGORIES.reduce((n, c) => n + breakdown[c], 0)
      }
    } catch (error) {
      this.logger.warn(
        `api usage read failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    return {
      source: 'LOCAL',
      used,
      limit,
      percent: Math.min(999, Math.round((used / limit) * 1000) / 10),
      dateUtc,
      breakdown,
      note: 'Показано запити до ABRA, виконані цим сайтом. Фактичне використання ліміту в ABRA може бути більшим, якщо API використовують інші інтеграції.',
    }
  }
}
