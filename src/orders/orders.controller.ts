import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { Role } from '@prisma/client'
import { Request } from 'express'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard'
import { CreateOrderDto } from './dto/create-order.dto'
import { PatchOrderStatusDto } from './dto/patch-order-status.dto'
import { OrdersService } from './orders.service'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findAll(@Query('search') search?: string, @Query('status') status?: string) {
    return this.orders.findAll({ search, status })
  }

  @Get('confirmation/:orderNumber')
  findConfirmation(@Param('orderNumber') orderNumber: string) {
    return this.orders.findConfirmationByOrderNumber(orderNumber)
  }

  @Get(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id)
  }

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  create(
    @Body() dto: CreateOrderDto,
    @Req() req: Request & { user?: SessionJwtPayload },
  ) {
    return this.orders.create(dto, req.user?.userId)
  }

  @Patch(':id/status')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateStatus(@Param('id') id: string, @Body() dto: PatchOrderStatusDto) {
    return this.orders.updateStatus(id, dto.status)
  }

  @Delete(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.orders.remove(id)
  }
}
