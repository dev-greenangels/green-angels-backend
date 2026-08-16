import { Transform, Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

import { CreateOrderItemDto } from './create-order-item.dto'

class SplitCheckoutDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  partIndex!: number

  @Type(() => Number)
  @IsInt()
  @Min(2)
  partCount!: number
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[]

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  customerFirstName!: string

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  customerLastName!: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerPatronymic?: string

  @IsString()
  @MinLength(10)
  @MaxLength(30)
  customerPhone!: string

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() ? value.trim() : undefined))
  @IsEmail()
  @MaxLength(200)
  customerEmail?: string

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  receiverFirstName!: string

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  receiverLastName!: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiverPatronymic?: string

  @IsString()
  @MinLength(10)
  @MaxLength(30)
  receiverPhone!: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  deliveryMethod!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliveryCity?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryBranch?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryBranchLabel?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryStreet?: string

  @IsOptional()
  @IsString()
  @MaxLength(50)
  deliveryHouseNumber?: string

  /** SK/EU courier postal code (PSČ) */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  deliveryPostalCode?: string

  /** Shipping destination country (sk|hu|at|cz|de|…) */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  deliveryCountryCode?: string

  /** Optional company/org on the package recipient (not the billing entity) */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiverCompanyName?: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  paymentMethod!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  promoCode?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  promoCodes?: string[]

  @IsOptional()
  @ValidateNested()
  @Type(() => SplitCheckoutDto)
  splitCheckout?: SplitCheckoutDto

  /** Intent only (stored on Order). SEC-007: never creates a User from raw PII. */
  @IsOptional()
  @IsBoolean()
  createAccount?: boolean

  @IsOptional()
  @IsBoolean()
  privacyConsent?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(20)
  privacyConsentVersion?: string

  /** Реферальний код друга з cookie `ga-ref`, який передає shop BFF. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  referralCode?: string

  /** Кількість власних балів клієнта, які він хоче списати в оплату замовлення. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pointsToRedeem?: number

  /** B2B — legal entity name */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  companyLegalName?: string

  /** B2B — IČO / ЄДРПОУ */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  companyIco?: string

  /** B2B — DIČ */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  companyDic?: string

  /** B2B — IČ DPH / VAT ID */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  companyVatId?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyStreet?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyCity?: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  companyPostalCode?: string

  /** Preferred dispatch date YYYY-MM-DD */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  preferredShipDate?: string

  /** SK multi-domain country (sk|hu|at) */
  @IsOptional()
  @IsIn(['sk', 'hu', 'at'])
  countryCode?: 'sk' | 'hu' | 'at'

  /** individual | company — for VAT regime + company fields with any payment method */
  @IsOptional()
  @IsIn(['individual', 'company'])
  buyerType?: 'individual' | 'company'

  /** ISO VAT country prefix for VIES (SK, HU, AT, …) */
  @IsOptional()
  @IsString()
  @MaxLength(2)
  vatCountryCode?: string

  /** Shop origin for payment success/cancel redirects (multi-domain) */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  returnBaseUrl?: string
}
