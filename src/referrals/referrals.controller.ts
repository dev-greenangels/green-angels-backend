import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import type { Request } from 'express'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { RedeemPointsPreviewDto } from './dto/redeem-points-preview.dto'
import { UpsertReferralProgramDto } from './dto/upsert-referral-program.dto'
import { ReferralsService } from './referrals.service'

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.referrals.getMe(req.user.userId)
  }

  @Get('points/preview')
  @UseGuards(JwtAuthGuard)
  previewPointsRedemption(
    @Req() req: Request & { user: SessionJwtPayload },
    @Query() query: RedeemPointsPreviewDto,
  ) {
    return this.referrals.previewPointsRedemption(req.user.userId, query.points)
  }

  @Post('claim/:code')
  claim(@Param('code') code: string) {
    return this.referrals.claim(code)
  }

  @Get('program/public')
  getPublicProgram() {
    return this.referrals.getPublicProgramSummary()
  }

  @Get('program')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getBackstageProgram() {
    return this.referrals.getBackstageProgram()
  }

  @Patch('program')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateProgram(@Body() dto: UpsertReferralProgramDto) {
    return this.referrals.upsertProgram(dto)
  }
}
