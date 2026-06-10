import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'

import { CategoriesService } from './categories.service'
import { CreateCategoryDto } from './dto/create-category.dto'
import { UpdateCategoryDto } from './dto/update-category.dto'

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findAll(@Query('locale') locale?: string) {
    return this.categories.findTree(locale)
  }

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categories.remove(id)
  }
}
