import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { DiscountRulesService } from './discount-rules.service'
import { UpsertDiscountRuleDto } from './dto/upsert-discount-rule.dto'

@Controller('discount-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class DiscountRulesController {
  constructor(private readonly rules: DiscountRulesService) {}

  @Get('backstage/all')
  findAll() {
    return this.rules.findAll()
  }

  @Post()
  create(@Body() dto: UpsertDiscountRuleDto) {
    return this.rules.create(dto)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpsertDiscountRuleDto) {
    return this.rules.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rules.remove(id)
  }
}
