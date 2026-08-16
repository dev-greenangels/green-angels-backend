import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator'

import { PRODUCT_IMAGE_PATH_REGEX } from '../upload-paths'

class FinalizeProductImageItemDto {
  @IsString()
  @MaxLength(500)
  @Matches(PRODUCT_IMAGE_PATH_REGEX, { message: 'Некоректний шлях зображення товару.' })
  url!: string

  @IsOptional()
  @IsBoolean()
  isMain?: boolean
}

export class FinalizeProductImagesDto {
  @IsString()
  productId!: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalizeProductImageItemDto)
  images!: FinalizeProductImageItemDto[]
}
