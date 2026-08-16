import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
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

  @IsOptional()
  @IsString()
  bic?: string

  @IsOptional()
  @IsString()
  dic?: string

  @IsOptional()
  @IsString()
  icDph?: string
}

export class CheckoutNextStepItemDto {
  @IsOptional()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  description?: string
}

export class CartWeightSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsBoolean()
  useFactKg?: boolean

  @IsOptional()
  @IsBoolean()
  useVolumetricKg?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  volumetricDivisor?: number
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
  @IsBoolean()
  showPromoCode?: boolean

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
  @IsIn(['flat', 'boxes'])
  packagingMode?: 'flat' | 'boxes'

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  boxMaxWeightKg?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  boxMaxVolumeL?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  boxUnitPrice?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  boxesPerPallet?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  palletSurcharge?: number

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
  taxAppliesToFees?: boolean

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
  @IsArray()
  deliveryWeightRules?: Array<{ maxWeightKg: number; allowedMethods: string[] }>

  /**
   * Weight tiers per delivery method slug, e.g.
   * { "packeta-box": [{ maxWeightKg: 5, amount: 3.49 }] }
   * Normalized in cart-checkout.normalize — keep DTO permissive for PATCH.
   */
  @IsOptional()
  @IsObject()
  carrierRateTables?: Record<string, Array<{ maxWeightKg: number; amount: number }>>

  @IsOptional()
  @ValidateNested()
  @Type(() => CartWeightSettingsDto)
  cartWeight?: CartWeightSettingsDto

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  codFeeAmount?: number

  @IsOptional()
  @IsIn(['fixed', 'percent'])
  codFeeMode?: 'fixed' | 'percent'

  @IsOptional()
  @IsIn(['monopay', 'stripe'])
  onlineCardProvider?: 'monopay' | 'stripe'

  @IsOptional()
  @IsIn(['immediate', 'on_paid'])
  onlineCardErpExportMode?: 'immediate' | 'on_paid'

  @IsOptional()
  @IsIn(['cart', 'store'])
  bankDetailsSource?: 'cart' | 'store'

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

  @IsOptional()
  @IsBoolean()
  allowShipmentSplit?: boolean

  @IsOptional()
  @IsBoolean()
  orderPdfDownloadEnabled?: boolean

  @IsOptional()
  @IsBoolean()
  orderPdfEmailEnabled?: boolean

  @IsOptional()
  @IsString()
  orderPdfTitle?: string
}
