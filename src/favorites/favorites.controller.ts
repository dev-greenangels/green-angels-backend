import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'

import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { SessionJwtPayload } from '../auth/auth.constants'
import { MergeFavoritesDto } from './dto/merge-favorites.dto'
import { ToggleFavoriteDto } from './dto/toggle-favorite.dto'
import { FavoritesService } from './favorites.service'

@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  findIds(@Req() req: Request & { user: SessionJwtPayload }) {
    return this.favorites.findProductIds(req.user.userId)
  }

  @Get('products')
  findProducts(
    @Req() req: Request & { user: SessionJwtPayload },
    @Query('locale') locale?: string,
  ) {
    return this.favorites.findProducts(req.user.userId, locale)
  }

  @Post()
  add(
    @Body() dto: ToggleFavoriteDto,
    @Req() req: Request & { user: SessionJwtPayload },
  ) {
    return this.favorites.add(req.user.userId, dto.productId)
  }

  @Post('merge')
  merge(
    @Body() dto: MergeFavoritesDto,
    @Req() req: Request & { user: SessionJwtPayload },
  ) {
    return this.favorites.merge(req.user.userId, dto)
  }

  @Delete(':productId')
  remove(
    @Param('productId') productId: string,
    @Req() req: Request & { user: SessionJwtPayload },
  ) {
    return this.favorites.remove(req.user.userId, productId)
  }
}
