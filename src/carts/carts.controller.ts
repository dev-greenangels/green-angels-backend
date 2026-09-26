import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Role } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import type { Request, Response } from 'express'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { GUEST_CART_COOKIE_NAME } from './cart.constants'
import { CartsService, type BackstageCartStateFilter } from './carts.service'
import { MergeCartDto, SyncCartDto } from './dto/sync-cart.dto'
import { UpdateCheckoutDraftDto } from './dto/update-checkout-draft.dto'

class BackstageCartsQueryDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsIn(['guest', 'user', 'all'])
  kind?: 'guest' | 'user' | 'all'

  @IsOptional()
  @IsIn([
    'all',
    'active',
    'abandoned',
    'cart_only',
    'checkout_started',
    'cart_abandoned',
    'checkout_abandoned',
  ])
  state?: BackstageCartStateFilter

  @IsOptional()
  @IsString()
  locale?: string

  @IsOptional()
  @IsString()
  updatedFrom?: string

  @IsOptional()
  @IsString()
  updatedTo?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number
}

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

  @Get('me/checkout-draft')
  @UseGuards(OptionalJwtAuthGuard)
  getCheckoutDraft(
    @Req() req: Request & { user?: SessionJwtPayload },
    @Res({ passthrough: true }) res: Response,
  ) {
    const owner = this.carts.resolveOwner(req, res)
    return this.carts.getCheckoutDraft(owner)
  }

  @Patch('me/checkout-draft')
  @UseGuards(OptionalJwtAuthGuard)
  patchCheckoutDraft(
    @Body() dto: UpdateCheckoutDraftDto,
    @Req() req: Request & { user?: SessionJwtPayload },
    @Res({ passthrough: true }) res: Response,
  ) {
    const owner = this.carts.resolveOwner(req, res)
    return this.carts.upsertCheckoutDraft(owner, dto)
  }

  @Post('me/checkout-start')
  @UseGuards(OptionalJwtAuthGuard)
  startCheckout(
    @Req() req: Request & { user?: SessionJwtPayload },
    @Res({ passthrough: true }) res: Response,
  ) {
    const owner = this.carts.resolveOwner(req, res)
    return this.carts.startCheckout(owner)
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
  listBackstage(@Query() query: BackstageCartsQueryDto) {
    return this.carts.listBackstage({
      search: query.search,
      kind: query.kind,
      state: query.state,
      locale: query.locale,
      updatedFrom: query.updatedFrom,
      updatedTo: query.updatedTo,
      page: query.page,
      pageSize: query.pageSize,
    })
  }

  @Get(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findOne(@Param('id') id: string) {
    return this.carts.findBackstageOne(id)
  }
}
