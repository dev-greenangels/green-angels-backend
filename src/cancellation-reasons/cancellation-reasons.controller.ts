import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { isCancellationSource } from '../orders/order-status.constants'
import { UpsertCancellationReasonDto } from './dto/upsert-cancellation-reason.dto'
import { CancellationReasonsService } from './cancellation-reasons.service'

@Controller('cancellation-reasons')
export class CancellationReasonsController {
  constructor(private readonly reasons: CancellationReasonsService) {}

  @Get()
  findAll(
    @Query('activeOnly') activeOnly?: string,
    @Query('source') source?: string,
  ) {
    const normalizedSource =
      source && isCancellationSource(source.toUpperCase())
        ? source.toUpperCase() as 'ADMIN' | 'USER' | 'SYSTEM'
        : undefined
    return this.reasons.findAll({
      activeOnly: activeOnly !== 'false',
      source: normalizedSource,
    })
  }

  @Post()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: UpsertCancellationReasonDto) {
    return this.reasons.create(dto)
  }

  @Patch(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpsertCancellationReasonDto) {
    return this.reasons.update(id, dto)
  }

  @Delete(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.reasons.remove(id)
  }
}
