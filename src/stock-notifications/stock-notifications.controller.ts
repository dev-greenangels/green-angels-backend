import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { APP_JOB_NAMES } from '../queue/queue.constants'
import { QueueService } from '../queue/queue.service'
import { CreateStockNotificationDto } from './dto/create-stock-notification.dto'
import { StockNotificationIdsDto } from './dto/stock-notification-ids.dto'
import { StockNotificationQueryDto } from './dto/stock-notification-query.dto'
import { StockNotificationsService } from './stock-notifications.service'

@Controller('stock-notifications')
export class StockNotificationsController {
  constructor(private readonly stockNotifications: StockNotificationsService) {}

  @Post()
  create(@Body() dto: CreateStockNotificationDto) {
    return this.stockNotifications.create(dto)
  }
}

@Controller('stock-notifications/backstage')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class StockNotificationsAdminController {
  constructor(
    private readonly stockNotifications: StockNotificationsService,
    private readonly queue: QueueService,
  ) {}

  @Get()
  findAll(@Query() query: StockNotificationQueryDto) {
    return this.stockNotifications.findAllBackstage(query)
  }

  @Get('pending-count')
  pendingCount() {
    return this.stockNotifications.countPendingBackstage()
  }

  @Get('jobs')
  async jobs() {
    const [counts, items] = await Promise.all([
      this.queue.getJobCounts(),
      this.queue.listJobsByName(APP_JOB_NAMES.SEND_STOCK_AVAILABLE),
    ])
    return { counts, items }
  }

  @Post('jobs/retry-failed')
  retryFailed() {
    return this.queue.retryFailedByName(APP_JOB_NAMES.SEND_STOCK_AVAILABLE)
  }

  @Post('jobs/drain')
  drain() {
    return this.queue.drainWaitingByName(APP_JOB_NAMES.SEND_STOCK_AVAILABLE)
  }

  @Post('send')
  send(@Body() dto: StockNotificationIdsDto) {
    return this.stockNotifications.enqueueSend(dto.ids)
  }

  @Post('delete-many')
  deleteMany(@Body() dto: StockNotificationIdsDto) {
    return this.stockNotifications.deleteMany(dto.ids)
  }

  @Delete(':id')
  deleteOne(@Param('id') id: string) {
    return this.stockNotifications.deleteOne(id)
  }
}
