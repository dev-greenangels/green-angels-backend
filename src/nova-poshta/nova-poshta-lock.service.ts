import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

import { NP_SYNC_CANCEL_KEY, NP_SYNC_LOCK_KEY } from './nova-poshta.constants'

@Injectable()
export class NovaPoshtaLockService implements OnModuleDestroy {
  private readonly redis: Redis

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      maxRetriesPerRequest: null,
    })
  }

  async onModuleDestroy() {
    await this.redis.quit()
  }

  get client(): Redis {
    return this.redis
  }

  async acquireSyncLock(ttlSeconds = 7200): Promise<boolean> {
    const result = await this.redis.set(NP_SYNC_LOCK_KEY, String(Date.now()), 'EX', ttlSeconds, 'NX')
    return result === 'OK'
  }

  async refreshSyncLock(ttlSeconds = 7200): Promise<void> {
    const exists = await this.redis.exists(NP_SYNC_LOCK_KEY)
    if (exists) {
      await this.redis.expire(NP_SYNC_LOCK_KEY, ttlSeconds)
    }
  }

  async releaseSyncLock(): Promise<void> {
    await this.redis.del(NP_SYNC_LOCK_KEY)
  }

  async isSyncLocked(): Promise<boolean> {
    const value = await this.redis.get(NP_SYNC_LOCK_KEY)
    return value !== null
  }

  async requestCancel(): Promise<void> {
    await this.redis.set(NP_SYNC_CANCEL_KEY, '1', 'EX', 300)
  }

  async clearCancel(): Promise<void> {
    await this.redis.del(NP_SYNC_CANCEL_KEY)
  }

  async isCancelRequested(): Promise<boolean> {
    const value = await this.redis.get(NP_SYNC_CANCEL_KEY)
    return value !== null
  }
}
