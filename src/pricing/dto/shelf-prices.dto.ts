import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator'

export class ShelfPricesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  variantIds!: string[]
}
