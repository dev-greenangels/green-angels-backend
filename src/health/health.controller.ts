import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs)
      promise
        .then((value) => {
          clearTimeout(timer)
          resolve(value)
        })
        .catch((error) => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  @Get()
  async check() {
    let databaseOk = false
    let redisOk = false

    try {
      await this.prisma.$queryRaw`SELECT 1`
      databaseOk = true
    } catch {
      databaseOk = false
    }

    try {
      const pong = await this.withTimeout(this.redis.client.ping(), 1000)
      redisOk = pong === 'PONG'
    } catch {
      redisOk = false
    }

    if (databaseOk && redisOk) {
      return { ok: true, service: 'green-angels-api', database: 'ok', redis: 'ok' }
    }

    throw new ServiceUnavailableException({
      ok: false,
      service: 'green-angels-api',
      database: databaseOk ? 'ok' : 'unavailable',
      redis: redisOk ? 'ok' : 'unavailable',
    })
  }
}
