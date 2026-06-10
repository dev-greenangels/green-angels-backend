import { Type } from 'class-transformer'
import { ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator'

import { CreateVariantAttributeValueDto } from './create-variant-attribute.dto'

export class AddVariantAttributeValuesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantAttributeValueDto)
  values!: CreateVariantAttributeValueDto[]

  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string
}
