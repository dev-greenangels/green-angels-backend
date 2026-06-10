import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'

import { CreateOrderDto } from './dto/create-order.dto'
import { PatchOrderStatusDto } from './dto/patch-order-status.dto'
import { OrdersService } from './orders.service'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  findAll(@Query('search') search?: string, @Query('status') status?: string) {
    return this.orders.findAll({ search, status })
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id)
  }

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto)
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: PatchOrderStatusDto) {
    return this.orders.updateStatus(id, dto.status)
  }
}
