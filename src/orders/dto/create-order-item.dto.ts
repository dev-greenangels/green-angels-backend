import { Type } from 'class-transformer'
import { IsInt, IsUUID, Min } from 'class-validator'

export class CreateOrderItemDto {
  @IsUUID()
  productVariantId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number
}
