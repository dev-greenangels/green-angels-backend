import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { UpsertPromoCodeDto } from './dto/upsert-promo-code.dto'
import { PromoCodesService } from './promo-codes.service'

@Controller('promo-codes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class PromoCodesController {
  constructor(private readonly promos: PromoCodesService) {}

  @Get('backstage/all')
  findAll() {
    return this.promos.findAll()
  }

  @Post()
  create(@Body() dto: UpsertPromoCodeDto) {
    return this.promos.create(dto)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpsertPromoCodeDto) {
    return this.promos.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promos.remove(id)
  }
}
