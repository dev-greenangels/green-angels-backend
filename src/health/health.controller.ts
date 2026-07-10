import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { ok: true, service: 'green-angels-api' }
    } catch {
      throw new ServiceUnavailableException({
        ok: false,
        service: 'green-angels-api',
        database: 'unavailable',
      })
    }
  }
}
