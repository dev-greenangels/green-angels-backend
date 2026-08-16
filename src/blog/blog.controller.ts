import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { BlogService } from './blog.service'
import { BlogBulkDto } from './dto/blog-bulk.dto'
import { BlogQueryDto } from './dto/blog-query.dto'
import { CreateBlogPostDto } from './dto/create-blog-post.dto'
import { UpdateBlogPostDto } from './dto/update-blog-post.dto'

@Controller('blog')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  /** Публічний список (лише опубліковані) з пагінацією. */
  @Get()
  findPublic(@Query() query: BlogQueryDto) {
    return this.blog.findPage({ ...query, publishedOnly: true }, true)
  }

  /** Повний список для бек-офісу (вкл. приховані). */
  @Get('admin')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findAdmin(@Query() query: BlogQueryDto) {
    return this.blog.findPage({ ...query, publishedOnly: false }, false)
  }

  @Post('bulk')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  bulk(@Body() dto: BlogBulkDto) {
    return this.blog.bulk(dto)
  }

  @Get('id/:id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  findById(@Param('id') id: string) {
    return this.blog.findById(id)
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.blog.findBySlug(slug, true)
  }

  @Post()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  create(@Body() dto: CreateBlogPostDto) {
    return this.blog.create(dto)
  }

  @Patch(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateBlogPostDto) {
    return this.blog.update(id, dto)
  }

  @Delete(':id')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  remove(@Param('id') id: string) {
    return this.blog.remove(id)
  }
}
