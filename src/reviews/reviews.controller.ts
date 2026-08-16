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
import { UpdateReviewReplyDto } from './dto/update-review-reply.dto'
import { UpdateReviewStatusDto } from './dto/update-review-status.dto'
import { ReviewsService } from './reviews.service'

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

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

  @Get('backstage/all')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findAllBackstage(@Query() query: ReviewQueryDto) {
    return this.reviews.findAllBackstage(query)
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
