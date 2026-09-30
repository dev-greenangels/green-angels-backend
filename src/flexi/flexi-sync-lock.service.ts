import { Injectable, Logger } from '@nestjs/common'

import { RedisService } from '../redis/redis.service'
import { FLEXI_SYNC_LOCK_KEY, FLEXI_SYNC_LOCK_TTL_SEC } from './flexi.constants'

/**
 * Distributed lock for Full Refresh / Update&Enable / order reconcile.
 * Heartbeat extends TTL while work runs so long Full Refresh does not expire mid-flight.
 */
@Injectable()
export class FlexiSyncLockService {
  private readonly logger = new Logger(FlexiSyncLockService.name)

  constructor(private readonly redis: RedisService) {}

  async tryAcquire(owner: string, ttlSec = FLEXI_SYNC_LOCK_TTL_SEC): Promise<boolean> {
    try {
      const result = await this.redis.client.set(
        FLEXI_SYNC_LOCK_KEY,
        owner,
        'EX',
        ttlSec,
        'NX',
      )
      return result === 'OK'
    } catch (error) {
      this.logger.warn(
        `Flexi sync lock acquire failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return false
    }
  }

  async extend(owner: string, ttlSec = FLEXI_SYNC_LOCK_TTL_SEC): Promise<boolean> {
    try {
      const current = await this.redis.client.get(FLEXI_SYNC_LOCK_KEY)
      if (current !== owner) return false
      await this.redis.client.expire(FLEXI_SYNC_LOCK_KEY, ttlSec)
      return true
    } catch (error) {
      this.logger.warn(
        `Flexi sync lock extend failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      return false
    }
  }

  async release(owner: string): Promise<void> {
    try {
      const current = await this.redis.client.get(FLEXI_SYNC_LOCK_KEY)
      if (current === owner) {
        await this.redis.client.del(FLEXI_SYNC_LOCK_KEY)
      }
    } catch (error) {
      this.logger.warn(
        `Flexi sync lock release failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async isHeld(): Promise<boolean> {
    try {
      return Boolean(await this.redis.client.get(FLEXI_SYNC_LOCK_KEY))
    } catch {
      return false
    }
  }

  async withLock<T>(
    owner: string,
    fn: () => Promise<T>,
  ): Promise<{ ok: true; result: T } | { ok: false; message: string }> {
    const acquired = await this.tryAcquire(owner)
    if (!acquired) {
      return { ok: false, message: 'Інша синхронізація ABRA вже виконується. Зачекайте.' }
    }
    const heartbeatMs = Math.max(10_000, Math.floor((FLEXI_SYNC_LOCK_TTL_SEC * 1000) / 3))
    const timer = setInterval(() => {
      void this.extend(owner)
    }, heartbeatMs)
    try {
      const result = await fn()
      return { ok: true, result }
    } finally {
      clearInterval(timer)
      await this.release(owner)
    }
  }
}
