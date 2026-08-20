import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import type { Request } from 'express'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { CreateWholesaleInquiryDto } from './dto/create-wholesale-inquiry.dto'
import { UpdateWholesaleInquiryStatusDto } from './dto/update-wholesale-inquiry-status.dto'
import { WholesaleInquiryQueryDto } from './dto/wholesale-inquiry-query.dto'
import { WholesaleInquiriesService } from './wholesale-inquiries.service'

@Controller('wholesale-inquiries')
export class WholesaleInquiriesController {
  constructor(private readonly inquiries: WholesaleInquiriesService) {}

  @Post()
  create(
    @Body() dto: CreateWholesaleInquiryDto,
    @Req() req: Request,
    @Headers('x-ga-client-ip') forwardedClientIp?: string,
  ) {
    const clientIp = this.inquiries.resolveClientIp({
      remoteAddress: req.socket?.remoteAddress,
      forwardedClientIp,
    })
    return this.inquiries.create(dto, clientIp)
  }

  @Get('backstage/new-count')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  newCount() {
    return this.inquiries.countNewBackstage()
  }

  @Get('backstage')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findAll(@Query() query: WholesaleInquiryQueryDto) {
    return this.inquiries.findAllBackstage(query)
  }

  @Patch('backstage/:id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateWholesaleInquiryStatusDto) {
    return this.inquiries.updateStatus(id, dto.status)
  }
}
