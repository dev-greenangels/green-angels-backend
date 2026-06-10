import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'

import { AddVariantAttributeValuesDto } from './dto/add-variant-attribute-values.dto'
import { CreateVariantAttributeDto } from './dto/create-variant-attribute.dto'
import { UpdateVariantAttributeDto } from './dto/update-variant-attribute.dto'
import { VariantAttributesService } from './variant-attributes.service'

@Controller('variant-attributes')
export class VariantAttributesController {
  constructor(private readonly service: VariantAttributesService) {}

  @Get()
  findAll(@Query('locale') locale?: string) {
    return this.service.findAll(locale)
  }

  @Post()
  create(@Body() dto: CreateVariantAttributeDto) {
    return this.service.create(dto)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVariantAttributeDto) {
    return this.service.update(id, dto)
  }

  @Post(':id/values')
  addValues(@Param('id') id: string, @Body() dto: AddVariantAttributeValuesDto) {
    return this.service.addValues(id, dto)
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id)
  }
}
