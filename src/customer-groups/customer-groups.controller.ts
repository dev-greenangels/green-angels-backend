import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CustomerGroupsService } from './customer-groups.service'
import { CreateCustomerGroupDto } from './dto/create-customer-group.dto'
import { UpdateCustomerGroupDto } from './dto/update-customer-group.dto'

@Controller('customer-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class CustomerGroupsController {
  constructor(private readonly groups: CustomerGroupsService) {}

  @Get('backstage/all')
  findAll() {
    return this.groups.findAll()
  }

  @Post()
  create(@Body() dto: CreateCustomerGroupDto) {
    return this.groups.create(dto)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerGroupDto) {
    return this.groups.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.groups.remove(id)
  }
}
