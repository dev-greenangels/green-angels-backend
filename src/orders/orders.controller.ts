import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import { Role } from '@prisma/client'
import { Request } from 'express'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard'
import { CreateOrderDto } from './dto/create-order.dto'
import { PatchOrderDto } from './dto/patch-order.dto'
import { ORDER_IDEMPOTENCY_KEY_HEADER } from './order-idempotency.constants'
import { PatchOrderStatusDto } from './dto/patch-order-status.dto'
import { ORDER_CONFIRMATION_TOKEN_HEADER } from './order-confirmation.constants'
import { OrdersService } from './orders.service'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.orders.findAll({
      search,
      status,
      page: page != null && page !== '' ? Number(page) : undefined,
      pageSize: pageSize != null && pageSize !== '' ? Number(pageSize) : undefined,
    })
  }

  @Get('summary')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findSummary() {
    return this.orders.findSummary()
  }

  @Get('confirmation/:orderNumber/pdf')
  @UseGuards(OptionalJwtAuthGuard)
  async findConfirmationPdf(
    @Param('orderNumber') orderNumber: string,
    @Req() req: Request & { user?: SessionJwtPayload },
    @Headers(ORDER_CONFIRMATION_TOKEN_HEADER) confirmationToken?: string,
  ) {
    const pdf = await this.orders.buildConfirmationPdf(orderNumber, {
      userId: req.user?.userId,
      confirmationToken,
    })
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="order-${orderNumber.replace(/[^\w-]+/g, '-')}.pdf"`,
    })
  }

  @Get('confirmation/:orderNumber')
  @UseGuards(OptionalJwtAuthGuard)
  findConfirmation(
    @Param('orderNumber') orderNumber: string,
    @Req() req: Request & { user?: SessionJwtPayload },
    @Headers(ORDER_CONFIRMATION_TOKEN_HEADER) confirmationToken?: string,
  ) {
    return this.orders.findConfirmationByOrderNumber(orderNumber, {
      userId: req.user?.userId,
      confirmationToken,
    })
  }

  @Post('confirmation/:orderNumber/cancel')
  @UseGuards(OptionalJwtAuthGuard)
  cancelConfirmation(
    @Param('orderNumber') orderNumber: string,
    @Req() req: Request & { user?: SessionJwtPayload },
    @Headers(ORDER_CONFIRMATION_TOKEN_HEADER) confirmationToken?: string,
  ) {
    return this.orders.cancelConfirmationOrder(orderNumber, {
      userId: req.user?.userId,
      confirmationToken,
    })
  }

  @Post('confirmation/:orderNumber/payment/retry')
  @UseGuards(OptionalJwtAuthGuard)
  retryConfirmationPayment(
    @Param('orderNumber') orderNumber: string,
    @Req() req: Request & { user?: SessionJwtPayload },
    @Headers(ORDER_CONFIRMATION_TOKEN_HEADER) confirmationToken?: string,
    @Body() body?: { returnBaseUrl?: string },
  ) {
    return this.orders.retryConfirmationPayment(orderNumber, {
      userId: req.user?.userId,
      confirmationToken,
      returnBaseUrl: body?.returnBaseUrl,
    })
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
    @Headers(ORDER_IDEMPOTENCY_KEY_HEADER) idempotencyKey?: string,
  ) {
    return this.orders.create(dto, req.user?.userId, idempotencyKey)
  }

  @Patch(':id/status')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateStatus(@Param('id') id: string, @Body() dto: PatchOrderStatusDto) {
    return this.orders.updateStatus(id, dto.status, {
      cancellationReasonId: dto.cancellationReasonId,
      cancellationNote: dto.cancellationNote,
    })
  }

  @Patch(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  patch(@Param('id') id: string, @Body() dto: PatchOrderDto) {
    return this.orders.patch(id, dto)
  }

  @Post(':id/sync-tracking')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  syncTracking(@Param('id') id: string) {
    return this.orders.syncTracking(id)
  }

  @Delete(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.orders.remove(id)
  }
}
