import { Body, Controller, Get, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { TedbQueueService } from './tedb.queue'
import { TedbService } from './tedb.service'

class UpdateTedbSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabledAuto?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cron?: string
}

@Controller('backstage/tedb')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class TedbController {
  constructor(
    private readonly tedb: TedbService,
    private readonly queue: TedbQueueService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.tedb.getSettings()
  }

  @Patch('settings')
  async updateSettings(@Body() dto: UpdateTedbSettingsDto) {
    const next = await this.tedb.updateSettings(dto)
    await this.queue.refreshRepeatableJob()
    return next
  }

  @Get('rates')
  listRates(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.tedb.listRates(Number(page) || 1, Number(pageSize) || 50)
  }

  @Post('sync')
  async syncNow() {
    return this.tedb.syncFromTedb()
  }
}
