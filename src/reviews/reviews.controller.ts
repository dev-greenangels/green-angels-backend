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
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { SessionJwtPayload } from '../auth/auth.constants'
import { CreateReviewDto } from './dto/create-review.dto'
import { ReviewQueryDto } from './dto/review-query.dto'
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
  @UseGuards(JwtAuthGuard)
  create(
    @Body() dto: CreateReviewDto,
    @Req() req: Request & { user: SessionJwtPayload },
  ) {
    return this.reviews.create(req.user.userId, dto)
  }

  @Get('backstage/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findAllBackstage(@Query() query: ReviewQueryDto) {
    return this.reviews.findAllBackstage(query)
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateReviewStatusDto) {
    return this.reviews.updateStatus(id, dto)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.reviews.remove(id)
  }
}
