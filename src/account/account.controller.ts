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
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Request, Response } from 'express'

import { AuthService } from '../auth/auth.service'
import type { SessionJwtPayload } from '../auth/auth.constants'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AccountService } from './account.service'
import { ClaimGuestOrderDto } from './dto/claim-guest-order.dto'
import {
  ConfirmContactDto,
  StartEmailContactDto,
  StartPhoneContactDto,
} from './dto/contact-lifecycle.dto'
import { DeleteAccountDto } from './dto/delete-account.dto'
import { UpdateAccountProfileDto } from './dto/update-account-profile.dto'
import { resolveOtpRateLimitPeerIp } from '../auth/otp.service'

@Controller('account')
@UseGuards(JwtAuthGuard)
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly auth: AuthService,
  ) {}

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

  @Post('contacts/email/start')
  startEmailContact(
    @Req() req: Request & { user: SessionJwtPayload },
    @Body() dto: StartEmailContactDto,
  ) {
    return this.account.startEmailContact(
      req.user.userId,
      dto.email,
      resolveOtpRateLimitPeerIp(req.socket?.remoteAddress),
      dto.countrySiteCode,
    )
  }

  @Post('contacts/email/confirm')
  confirmEmailContact(
    @Req() req: Request & { user: SessionJwtPayload },
    @Body() dto: ConfirmContactDto,
  ) {
    return this.account.confirmEmailContact(req.user.userId, dto.verificationToken)
  }

  @Post('contacts/phone/start')
  startPhoneContact(
    @Req() req: Request & { user: SessionJwtPayload },
    @Body() dto: StartPhoneContactDto,
  ) {
    return this.account.startPhoneContact(
      req.user.userId,
      dto.phone,
      resolveOtpRateLimitPeerIp(req.socket?.remoteAddress),
    )
  }

  @Post('contacts/phone/confirm')
  confirmPhoneContact(
    @Req() req: Request & { user: SessionJwtPayload },
    @Body() dto: ConfirmContactDto,
  ) {
    return this.account.confirmPhoneContact(req.user.userId, dto.verificationToken)
  }

  @Post('contacts/phone/clear')
  clearPhoneContact(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.account.clearPhoneContact(req.user.userId)
  }

  @Get('orders')
  listOrders(
    @Req() req: Request & { user: SessionJwtPayload },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.account.listOrdersPage(req.user.userId, {
      page: page != null && page !== '' ? Number(page) : undefined,
      pageSize: pageSize != null && pageSize !== '' ? Number(pageSize) : undefined,
    })
  }

  @Get('orders/:id')
  getOrder(
    @Req() req: Request & { user: SessionJwtPayload },
    @Param('id') id: string,
  ) {
    return this.account.getOrderDetail(req.user.userId, id)
  }

  @Get('reviews')
  listReviews(
    @Req() req: Request & { user: SessionJwtPayload },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.account.listReviewsPage(req.user.userId, {
      page: page != null && page !== '' ? Number(page) : undefined,
      pageSize: pageSize != null && pageSize !== '' ? Number(pageSize) : undefined,
    })
  }

  @Get('stock-notifications')
  listStockNotifications(
    @Req() req: Request & { user: SessionJwtPayload },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.account.listStockNotificationsPage(req.user.userId, {
      page: page != null && page !== '' ? Number(page) : undefined,
      pageSize: pageSize != null && pageSize !== '' ? Number(pageSize) : undefined,
    })
  }

  @Delete('stock-notifications/:id')
  removeStockNotification(
    @Req() req: Request & { user: SessionJwtPayload },
    @Param('id') id: string,
  ) {
    return this.account.removeStockNotification(req.user.userId, id)
  }

  @Get('export')
  exportData(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.account.exportData(req.user.userId)
  }

  @Post('orders/:id/attach')
  attachOrphanOrder(
    @Req() req: Request & { user: SessionJwtPayload },
    @Param('id') id: string,
  ) {
    return this.account.attachOrphanOrder(req.user.userId, id)
  }

  @Post('orders/claim')
  claimGuestOrder(
    @Req() req: Request & { user: SessionJwtPayload },
    @Body() dto: ClaimGuestOrderDto,
  ) {
    return this.account.claimGuestOrder(req.user.userId, dto)
  }

  @Post('delete')
  async deleteAccount(
    @Req() req: Request & { user: SessionJwtPayload },
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.account.deleteAccount(req.user.userId, dto)
    this.auth.clearSessionCookie(res)
    return result
  }
}
