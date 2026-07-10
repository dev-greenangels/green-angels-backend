import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Role } from '@prisma/client'
import type { Request, Response } from 'express'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { GUEST_CART_COOKIE_NAME } from './cart.constants'
import { CartsService } from './carts.service'
import { MergeCartDto, SyncCartDto } from './dto/sync-cart.dto'

@Controller('carts')
export class CartsController {
  constructor(private readonly carts: CartsService) {}

  @Get('me')
  @UseGuards(OptionalJwtAuthGuard)
  getMine(
    @Req() req: Request & { user?: SessionJwtPayload },
    @Res({ passthrough: true }) res: Response,
    @Query('locale') locale?: string,
  ) {
    const owner = this.carts.resolveOwner(req, res)
    return this.carts.getCart(owner, locale)
  }

  @Put('me')
  @UseGuards(OptionalJwtAuthGuard)
  syncMine(
    @Body() dto: SyncCartDto,
    @Req() req: Request & { user?: SessionJwtPayload },
    @Res({ passthrough: true }) res: Response,
    @Query('locale') locale?: string,
  ) {
    const owner = this.carts.resolveOwner(req, res)
    return this.carts.syncCart(owner, dto, locale)
  }

  @Get('merge-preview')
  @UseGuards(JwtAuthGuard)
  mergePreview(
    @Req() req: Request & { user: SessionJwtPayload },
    @Query('locale') locale?: string,
  ) {
    const guestSessionId = req.cookies?.[GUEST_CART_COOKIE_NAME]?.trim() || undefined
    return this.carts.getMergePreview(req.user.userId, guestSessionId, locale)
  }

  @Post('merge')
  @UseGuards(JwtAuthGuard)
  merge(
    @Body() dto: MergeCartDto,
    @Req() req: Request & { user: SessionJwtPayload },
    @Res({ passthrough: true }) res: Response,
    @Query('locale') locale?: string,
  ) {
    const guestSessionId = req.cookies?.[GUEST_CART_COOKIE_NAME]?.trim() || undefined
    return this.carts.applyMerge(req.user.userId, guestSessionId, dto.strategy, locale, res)
  }

  @Get()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  listBackstage(
    @Query('search') search?: string,
    @Query('kind') kind?: 'guest' | 'user' | 'all',
  ) {
    return this.carts.listBackstage({ search, kind })
  }

  @Get(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findOne(@Param('id') id: string) {
    return this.carts.findBackstageOne(id)
  }
}
