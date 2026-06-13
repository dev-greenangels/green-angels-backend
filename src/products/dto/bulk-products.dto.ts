import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator'

export const BULK_PRODUCT_ACTIONS = [
  'delete',
  'publish',
  'unpublish',
  'set_stock',
] as const

export type BulkProductAction = (typeof BULK_PRODUCT_ACTIONS)[number]

export class BulkProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  ids!: string[]

  @IsIn(BULK_PRODUCT_ACTIONS)
  action!: BulkProductAction

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number
}
