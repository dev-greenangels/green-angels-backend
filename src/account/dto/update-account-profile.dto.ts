import { Type } from 'class-transformer'
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator'

import { CHECKOUT_DELIVERY_METHODS } from '../../settings/checkout-methods.constants'

const DELIVERY_METHODS = [...CHECKOUT_DELIVERY_METHODS] as string[]

export class DeliveryDefaultsDto {
  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  branch?: string

  @IsOptional()
  @IsString()
  street?: string

  @IsOptional()
  @IsString()
  houseNumber?: string

  @IsOptional()
  @IsString()
  postalCode?: string

  @IsOptional()
  @IsString()
  countryCode?: string

  @IsOptional()
  @IsIn(DELIVERY_METHODS)
  method?: string
}

export class BillingDefaultsDto {
  @IsOptional()
  @IsIn(['individual', 'company'])
  buyerType?: 'individual' | 'company'

  @IsOptional()
  @IsString()
  firstName?: string

  @IsOptional()
  @IsString()
  lastName?: string

  @IsOptional()
  @IsString()
  countryCode?: string

  @IsOptional()
  @IsString()
  street?: string

  @IsOptional()
  @IsString()
  city?: string

  @IsOptional()
  @IsString()
  postalCode?: string

  @IsOptional()
  @IsString()
  companyLegalName?: string

  @IsOptional()
  @IsString()
  companyIco?: string

  @IsOptional()
  @IsString()
  companyDic?: string

  @IsOptional()
  @IsString()
  companyVatId?: string

  @IsOptional()
  @IsString()
  vatCountryCode?: string
}

export class UpdateAccountProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string

  @IsOptional()
  @IsString()
  patronymic?: string

  /** Identity contacts are not mutable via profile PATCH (BATCH 4A). */
  @IsOptional()
  @IsEmail()
  email?: string

  /** Identity contacts are not mutable via profile PATCH (BATCH 4A). */
  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryDefaultsDto)
  deliveryDefaults?: DeliveryDefaultsDto

  @IsOptional()
  @ValidateNested()
  @Type(() => BillingDefaultsDto)
  billingDefaults?: BillingDefaultsDto
}
