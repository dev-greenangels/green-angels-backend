import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AccountService } from './account.service'
import { UpdateAccountProfileDto } from './dto/update-account-profile.dto'

@Controller('account')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('dashboard')
  getDashboard(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.account.getDashboardStats(req.user.userId)
  }

  @Get('profile')
  getProfile(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.account.getProfile(req.user.userId)
  }

  @Patch('profile')
  updateProfile(
    @Req() req: Request & { user: SessionJwtPayload },
    @Body() dto: UpdateAccountProfileDto,
  ) {
    return this.account.updateProfile(req.user.userId, dto)
  }

  @Get('orders')
  listOrders(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.account.listOrders(req.user.userId)
  }

  @Get('reviews')
  listReviews(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.account.listReviews(req.user.userId)
  }

  @Get('stock-notifications')
  listStockNotifications(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.account.listStockNotifications(req.user.userId)
  }

  @Delete('stock-notifications/:id')
  removeStockNotification(
    @Req() req: Request & { user: SessionJwtPayload },
    @Param('id') id: string,
  ) {
    return this.account.removeStockNotification(req.user.userId, id)
  }
}
