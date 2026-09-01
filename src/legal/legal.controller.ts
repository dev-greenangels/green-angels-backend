import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import type { Request, Response } from 'express'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard'
import { CreateLegalRevisionDto, UpdateLegalRevisionDto } from './dto/create-revision.dto'
import { LegalLocaleQueryDto } from './dto/legal-query.dto'
import {
  MarketingSubscribersExportQueryDto,
  MarketingSubscribersQueryDto,
} from './dto/marketing-subscribers-query.dto'
import { RecordConsentDto } from './dto/record-consent.dto'
import { LegalService } from './legal.service'

@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get('current')
  getCurrent(@Query() query: LegalLocaleQueryDto) {
    return this.legal.getCurrent(query.locale)
  }

  @Get('admin')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  listAdmin(@Query() query: LegalLocaleQueryDto) {
    return this.legal.listAdmin(query.locale)
  }

  @Post('admin/revisions')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  createDraft(
    @Body() dto: CreateLegalRevisionDto,
    @Req() req: Request & { user?: SessionJwtPayload },
  ) {
    return this.legal.createDraft(dto, req.user)
  }

  @Patch('admin/revisions/:id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateDraft(@Param('id') id: string, @Body() dto: UpdateLegalRevisionDto) {
    return this.legal.updateDraft(id, dto)
  }

  @Post('admin/revisions/:id/publish')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  publish(@Param('id') id: string) {
    return this.legal.publish(id)
  }

  @Get('admin/marketing-subscribers')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  listMarketingSubscribers(@Query() query: MarketingSubscribersQueryDto) {
    return this.legal.listMarketingSubscribersBackstage(query)
  }

  @Get('admin/marketing-subscribers/export')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async exportMarketingSubscribers(
    @Query() query: MarketingSubscribersExportQueryDto,
    @Res() res: Response,
  ) {
    const { buffer, contentType, filename } =
      await this.legal.exportMarketingSubscribersBackstage(query)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', String(buffer.length))
    res.send(buffer)
  }

  @Post('consents')
  @UseGuards(OptionalJwtAuthGuard)
  recordConsent(
    @Body() dto: RecordConsentDto,
    @Req() req: Request & { user?: SessionJwtPayload },
  ) {
    return this.legal.recordConsent(dto, req.user?.userId)
  }

  /** One-click marketing unsubscribe (no login). Must be registered before `:type`. */
  @Get('marketing/unsubscribe')
  unsubscribeMarketing(@Query('token') token?: string) {
    return this.legal.withdrawMarketingByToken(token?.trim() || '')
  }

  @Get(':type')
  getByType(@Param('type') type: string, @Query() query: LegalLocaleQueryDto) {
    return this.legal.getByType(type, query.locale)
  }
}
