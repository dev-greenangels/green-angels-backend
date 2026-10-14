import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import type { Request } from 'express'
import { IsArray, IsString } from 'class-validator'

import type { SessionJwtPayload } from '../auth.constants'
import { BackstageJwtAuthGuard } from '../backstage-jwt-auth.guard'
import { Roles } from '../decorators/roles.decorator'
import { RequirePermissions } from '../decorators/require-permissions.decorator'
import { RolesGuard } from '../guards/roles.guard'
import { PermissionsService } from './permissions.service'

class ReplacePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissions!: string[]
}

@Controller('staff-permissions')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
export class StaffPermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get('registry')
  @Roles(Role.ADMIN)
  registry() {
    return {
      items: this.permissions.listRegistry(),
    }
  }

  @Get('users/:userId')
  @Roles(Role.ADMIN)
  async getUserPermissions(@Param('userId') userId: string) {
    const permissions = await this.permissions.getUserPermissions(userId)
    return { userId, permissions }
  }

  @Put('users/:userId')
  @Roles(Role.ADMIN)
  async replaceUserPermissions(
    @Param('userId') userId: string,
    @Body() dto: ReplacePermissionsDto,
    @Req() req: Request & { user: SessionJwtPayload },
  ) {
    const permissions = await this.permissions.replaceManagerPermissions(
      userId,
      dto.permissions ?? [],
      req.user.userId,
    )
    return { userId, permissions }
  }
}
