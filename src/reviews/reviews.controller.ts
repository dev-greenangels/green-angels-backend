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
  UseGuards,
} from '@nestjs/common'
import { Role } from '@prisma/client'
import type { Request } from 'express'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard'
import type { SessionJwtPayload } from '../auth/auth.constants'
import { CreateReviewDto } from './dto/create-review.dto'
import { ReviewQueryDto } from './dto/review-query.dto'
import { SubmitOrderReviewByTokenDto } from './dto/submit-order-review-by-token.dto'
import {
  PreviewReviewRequestEmailDto,
  SendReviewRequestEmailDto,
} from './dto/review-request-email.dto'
import { UpdateReviewReplyDto } from './dto/update-review-reply.dto'
import { UpdateReviewStatusDto } from './dto/update-review-status.dto'
import { ReviewRequestService } from './review-request.service'
import { ReviewsService } from './reviews.service'

@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly reviewRequests: ReviewRequestService,
  ) {}

  @Get()
  findPublished(@Query() query: ReviewQueryDto) {
    return this.reviews.findPublished(query)
  }

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  create(
    @Body() dto: CreateReviewDto,
    @Req() req: Request & { user?: SessionJwtPayload },
  ) {
    return this.reviews.create(req.user?.userId, dto)
  }

  @Get('request/:token')
  resolveRequest(@Param('token') token: string, @Req() req: Request) {
    return this.reviewRequests.resolveByToken(token, req.ip)
  }

  @Post('request/:token')
  submitRequest(
    @Param('token') token: string,
    @Body() dto: SubmitOrderReviewByTokenDto,
    @Req() req: Request,
  ) {
    return this.reviewRequests.submitByToken(token, dto, req.ip)
  }

  @Get('backstage/pending-count')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  pendingCount() {
    return this.reviews.countPendingBackstage()
  }

  @Get('backstage/all')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findAllBackstage(@Query() query: ReviewQueryDto) {
    return this.reviews.findAllBackstage(query)
  }

  @Get('backstage/orders/:orderId/request')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  backstageRequestStatus(@Param('orderId') orderId: string) {
    return this.reviewRequests.getBackstageStatus(orderId)
  }

  @Post('backstage/orders/:orderId/request')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  generateRequest(
    @Param('orderId') orderId: string,
    @Req() req: Request & { user: SessionJwtPayload },
  ) {
    return this.reviewRequests.generateForOrder(orderId, req.user.userId)
  }

  @Post('backstage/orders/:orderId/request/regenerate')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  regenerateRequest(
    @Param('orderId') orderId: string,
    @Req() req: Request & { user: SessionJwtPayload },
  ) {
    return this.reviewRequests.regenerateForOrder(orderId, req.user.userId)
  }

  @Post('backstage/orders/:orderId/request/revoke')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  revokeRequest(
    @Param('orderId') orderId: string,
    @Req() req: Request & { user: SessionJwtPayload },
  ) {
    return this.reviewRequests.revokeForOrder(orderId, req.user.userId)
  }

  @Post('backstage/orders/:orderId/request/preview')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  previewRequestEmail(
    @Param('orderId') orderId: string,
    @Body() dto: PreviewReviewRequestEmailDto,
  ) {
    return this.reviewRequests.previewEmailForOrder(orderId, dto.locale)
  }

  @Post('backstage/orders/:orderId/request/send')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  sendRequestEmail(
    @Param('orderId') orderId: string,
    @Body() dto: SendReviewRequestEmailDto,
    @Req() req: Request & { user: SessionJwtPayload },
  ) {
    return this.reviewRequests.sendEmailForOrder(orderId, req.user.userId, {
      locale: dto.locale,
      confirmRegenerate: dto.confirmRegenerate,
      idempotencyKey: dto.idempotencyKey,
    })
  }

  @Patch('backstage/orders/:orderId/reviews/status')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateStatusByOrder(
    @Param('orderId') orderId: string,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    return this.reviews.updateStatusByOrderId(orderId, dto)
  }

  @Patch(':id/status')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateReviewStatusDto) {
    return this.reviews.updateStatus(id, dto)
  }

  @Patch(':id/reply')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateReply(@Param('id') id: string, @Body() dto: UpdateReviewReplyDto) {
    return this.reviews.updateReply(id, dto)
  }

  @Delete(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.reviews.remove(id)
  }
}
