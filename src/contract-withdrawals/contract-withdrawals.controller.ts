import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import type { Request } from 'express'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { ContractWithdrawalsService } from './contract-withdrawals.service'
import {
  ContractWithdrawalQueryDto,
  CreateAccountContractWithdrawalDto,
  CreatePublicContractWithdrawalDto,
  UpdateContractWithdrawalStatusDto,
} from './dto/contract-withdrawal.dto'

@Controller('contract-withdrawals')
export class ContractWithdrawalsController {
  constructor(private readonly withdrawals: ContractWithdrawalsService) {}

  @Post('public')
  createPublic(
    @Body() dto: CreatePublicContractWithdrawalDto,
    @Req() req: Request,
    @Headers('x-ga-client-ip') forwardedClientIp?: string,
  ) {
    const clientIp = this.withdrawals.resolveClientIp({
      remoteAddress: req.socket?.remoteAddress,
      forwardedClientIp,
    })
    return this.withdrawals.createPublic(dto, clientIp)
  }

  @Post('account')
  @UseGuards(JwtAuthGuard)
  createAccount(
    @Req() req: Request & { user: SessionJwtPayload },
    @Body() dto: CreateAccountContractWithdrawalDto,
  ) {
    return this.withdrawals.createFromAccount(req.user.userId, dto)
  }

  @Get('account/orders/:orderId/meta')
  @UseGuards(JwtAuthGuard)
  getAccountMeta(
    @Req() req: Request & { user: SessionJwtPayload },
    @Param('orderId') orderId: string,
  ) {
    return this.withdrawals.getAccountOrderWithdrawalMeta(req.user.userId, orderId)
  }

  @Get('backstage')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findAllBackstage(@Query() query: ContractWithdrawalQueryDto) {
    return this.withdrawals.findAllBackstage(query)
  }

  @Get('backstage/new-count')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  newCount() {
    return this.withdrawals.countSubmittedBackstage()
  }

  @Get('backstage/:id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findOneBackstage(@Param('id') id: string) {
    return this.withdrawals.findOneBackstage(id)
  }

  @Patch('backstage/:id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateStatusBackstage(@Param('id') id: string, @Body() dto: UpdateContractWithdrawalStatusDto) {
    return this.withdrawals.updateStatusBackstage(id, dto.status)
  }
}
