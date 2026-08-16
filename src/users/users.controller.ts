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

import type { SessionJwtPayload } from '../auth/auth.constants'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { CreateStaffDto } from './dto/create-staff.dto'
import { DeleteUserDto } from './dto/delete-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { UpdateUserGroupsDto } from './dto/update-user-groups.dto'
import { UsersService } from './users.service'

@Controller('users')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post('staff')
  @Roles(Role.ADMIN)
  createStaff(@Body() dto: CreateStaffDto) {
    return this.users.createStaff(dto)
  }

  @Get()
  findAll(@Query('segment') segment?: string, @Query('search') search?: string) {
    return this.users.findAll({ segment, search })
  }

  @Get('count')
  count(@Query('segment') segment?: string) {
    return this.users.count({ segment })
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id)
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: Request & { user: SessionJwtPayload },
  ) {
    return this.users.update(id, dto, req.user.userId)
  }

  @Patch(':id/groups')
  updateGroups(@Param('id') id: string, @Body() dto: UpdateUserGroupsDto) {
    return this.users.updateGroups(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Body() dto: DeleteUserDto) {
    return this.users.remove(id, dto.deleteOrders)
  }
}
