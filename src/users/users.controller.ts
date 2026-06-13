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
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CreateStaffDto } from './dto/create-staff.dto'
import { DeleteUserDto } from './dto/delete-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { UsersService } from './users.service'

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
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

  @Delete(':id')
  remove(@Param('id') id: string, @Body() dto: DeleteUserDto) {
    return this.users.remove(id, dto.deleteOrders)
  }
}
