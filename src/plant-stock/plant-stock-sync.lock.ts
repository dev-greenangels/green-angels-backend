import { Injectable, Logger } from '@nestjs/common'

import { RedisService } from '../redis/redis.service'

const LOCK_PREFIX = 'plant-stock:sync:'
const DEFAULT_TTL_SEC = 15 * 60

@Injectable()
export class PlantStockSyncLockService {
  private readonly logger = new Logger(PlantStockSyncLockService.name)

  constructor(private readonly redis: RedisService) {}

  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    ttlSec = DEFAULT_TTL_SEC,
  ): Promise<{ ok: true; result: T } | { ok: false; message: string }> {
    const redisKey = `${LOCK_PREFIX}${key}`
    const owner = `${process.pid}:${Date.now()}`
    try {
      const acquired = await this.redis.client.set(redisKey, owner, 'EX', ttlSec, 'NX')
      if (acquired !== 'OK') {
        return { ok: false, message: `Синхронізація «${key}» вже виконується.` }
      }
    } catch (error) {
      this.logger.warn(
        `PlantStock lock acquire failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return { ok: false, message: 'Не вдалося отримати Redis lock.' }
    }

    const heartbeat = setInterval(() => {
      void this.redis.client.expire(redisKey, ttlSec).catch(() => undefined)
    }, Math.max(10_000, Math.floor((ttlSec * 1000) / 3)))

    try {
      const result = await fn()
      return { ok: true, result }
    } finally {
      clearInterval(heartbeat)
      try {
        const current = await this.redis.client.get(redisKey)
        if (current === owner) await this.redis.client.del(redisKey)
      } catch {
        /* ignore */
      }
    }
  }
}
