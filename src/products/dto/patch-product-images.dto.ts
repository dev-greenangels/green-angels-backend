import { Type } from 'class-transformer'
import { IsArray, ValidateNested } from 'class-validator'

import { ProductImageDto } from './product-image.dto'

export class PatchProductImagesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images!: ProductImageDto[]
}
