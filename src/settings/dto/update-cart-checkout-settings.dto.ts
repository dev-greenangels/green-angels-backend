import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator'

import type { BelowMinOrderBehavior } from '../cart-checkout.types'

export class UpdateCartCheckoutSettingsDto {
  @IsOptional()
  @IsBoolean()
  showDelivery?: boolean

  @IsOptional()
  @IsBoolean()
  showPackaging?: boolean

  @IsOptional()
  @IsBoolean()
  showTax?: boolean

  @IsOptional()
  @IsIn(['free', 'carrier_rates', 'fixed'])
  deliveryMode?: 'free' | 'carrier_rates' | 'fixed'

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deliveryAmount?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  packagingAmount?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxRatePercent?: number

  @IsOptional()
  @IsBoolean()
  taxIncluded?: boolean

  @IsOptional()
  @IsBoolean()
  deliveryFreeForPickup?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minOrderAmount?: number | null

  @IsOptional()
  @IsIn(['reject', 'add_packaging_fee'])
  belowMinOrderBehavior?: BelowMinOrderBehavior

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  belowMinPackagingFee?: number
}
