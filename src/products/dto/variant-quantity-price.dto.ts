import { Type } from 'class-transformer'
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator'

export const VARIANT_QUANTITY_DISCOUNT_TYPES = ['fixed_price', 'percent'] as const
export type VariantQuantityDiscountTypeDto = (typeof VARIANT_QUANTITY_DISCOUNT_TYPES)[number]

export class VariantQuantityPriceDto {
  @IsOptional()
  @IsUUID()
  id?: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  minQuantity!: number

  @IsOptional()
  @IsIn(VARIANT_QUANTITY_DISCOUNT_TYPES)
  discountType?: VariantQuantityDiscountTypeDto

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value!: number

  @IsOptional()
  @IsDateString()
  validFrom?: string

  @IsOptional()
  @IsDateString()
  validTo?: string
}
