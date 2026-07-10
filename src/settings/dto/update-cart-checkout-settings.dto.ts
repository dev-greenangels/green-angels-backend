import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator'

import type { BelowMinOrderBehavior } from '../cart-checkout.types'
import {
  CHECKOUT_DELIVERY_METHODS,
  CHECKOUT_PAYMENT_METHODS,
} from '../checkout-methods.constants'

export class CheckoutBankDetailsDto {
  @IsOptional()
  @IsString()
  organizationName?: string

  @IsOptional()
  @IsString()
  edrpou?: string

  @IsOptional()
  @IsString()
  iban?: string

  @IsOptional()
  @IsString()
  bankName?: string

  @IsOptional()
  @IsString()
  mfo?: string

  @IsOptional()
  @IsString()
  legalAddress?: string

  @IsOptional()
  @IsString()
  taxStatus?: string
}

export class CheckoutNextStepItemDto {
  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  description?: string
}

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

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn([...CHECKOUT_DELIVERY_METHODS], { each: true })
  enabledDeliveryMethods?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn([...CHECKOUT_PAYMENT_METHODS], { each: true })
  enabledPaymentMethods?: string[]

  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutBankDetailsDto)
  bankDetails?: CheckoutBankDetailsDto

  @IsOptional()
  @IsString()
  paymentPurposeTemplate?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutNextStepItemDto)
  nextSteps?: CheckoutNextStepItemDto[]

  @IsOptional()
  @IsString()
  gdprConsentText?: string
}
