import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { CreateRedirectDto } from './dto/create-redirect.dto'
import { UpdateRedirectDto } from './dto/update-redirect.dto'
import { RedirectsService } from './redirects.service'

@Controller('redirects')
export class RedirectsController {
  constructor(private readonly redirects: RedirectsService) {}

  @Get('active')
  getActiveMap() {
    return this.redirects.getActiveMap()
  }

  @Get('resolve')
  async resolve(@Query('path') path?: string) {
    if (!path?.trim()) return { redirect: null }
    const redirect = await this.redirects.resolve(path)
    return { redirect }
  }

  @Get('prefixes')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  listPrefixes() {
    return this.redirects.listPrefixes()
  }

  @Post('invalidate-cache')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async invalidateCache() {
    await this.redirects.invalidateCache()
    return { ok: true }
  }

  @Get()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findAll(@Query('prefix') prefix?: string) {
    return this.redirects.findAll(prefix)
  }

  @Get(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findById(@Param('id') id: string) {
    return this.redirects.findById(id)
  }

  @Post()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateRedirectDto) {
    return this.redirects.create(dto)
  }

  @Patch(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateRedirectDto) {
    return this.redirects.update(id, dto)
  }

  @Delete(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async remove(@Param('id') id: string) {
    await this.redirects.remove(id)
    return { ok: true }
  }
}
