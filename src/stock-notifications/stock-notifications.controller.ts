import { Body, Controller, Post } from '@nestjs/common'

import { CreateStockNotificationDto } from './dto/create-stock-notification.dto'
import { StockNotificationsService } from './stock-notifications.service'

@Controller('stock-notifications')
export class StockNotificationsController {
  constructor(private readonly stockNotifications: StockNotificationsService) {}

  @Post()
  create(@Body() dto: CreateStockNotificationDto) {
    return this.stockNotifications.create(dto)
  }
}
