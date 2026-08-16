import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { UpsertOrderStatusDefinitionDto } from './dto/upsert-order-status.dto'
import { OrderStatusesService } from './order-statuses.service'

@Controller('order-statuses')
export class OrderStatusesController {
  constructor(private readonly orderStatuses: OrderStatusesService) {}

  @Get()
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.orderStatuses.findAll({ activeOnly: activeOnly !== 'false' })
  }

  @Post()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: UpsertOrderStatusDefinitionDto) {
    return this.orderStatuses.create(dto)
  }

  @Patch(':code')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('code') code: string, @Body() dto: UpsertOrderStatusDefinitionDto) {
    return this.orderStatuses.update(code, dto)
  }

  @Delete(':code')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('code') code: string) {
    return this.orderStatuses.remove(code)
  }
}
