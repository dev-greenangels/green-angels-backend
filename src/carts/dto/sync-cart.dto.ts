import { Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsUUID, Min, ValidateNested } from 'class-validator'

export class CartLineInputDto {
  @IsUUID()
  productVariantId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number
}

export class SyncCartDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CartLineInputDto)
  items!: CartLineInputDto[]
}

export class MergeCartDto {
  @IsIn(['merge', 'keep_guest', 'keep_user', 'clear'])
  strategy!: 'merge' | 'keep_guest' | 'keep_user' | 'clear'
}
