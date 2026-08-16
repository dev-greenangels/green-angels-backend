import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

import type {
  CountrySiteCode,
  CountrySiteCurrency,
  GuestCheckoutMode,
  InventoryAuthorityMode,
  MarketRegion,
  PhonePolicy,
  PriceBasis,
  StorefrontPrimaryPrice,
} from '../market.types'

class CountrySiteProfileDto {
  @IsIn(['sk', 'hu', 'at'])
  code!: CountrySiteCode

  @IsBoolean()
  enabled!: boolean

  @IsString()
  @MaxLength(5)
  defaultLocale!: string

  @IsArray()
  @IsString({ each: true })
  availableLocales!: string[]

  @IsIn(['EUR', 'HUF'])
  currency!: CountrySiteCurrency

  @IsNumber()
  @Min(0)
  @Max(100)
  taxRatePercent!: number

  @IsBoolean()
  taxIncluded!: boolean
}

class DeliveryReducedRateDto {
  @IsString()
  @MaxLength(40)
  code!: string

  @IsNumber()
  @Min(0)
  @Max(100)
  percent!: number

  @IsArray()
  @IsString({ each: true })
  cnPrefixes!: string[]
}

class DeliveryCountryCatalogEntryDto {
  @IsString()
  @MaxLength(8)
  code!: string

  @IsBoolean()
  enabled!: boolean

  @IsString()
  @MaxLength(40)
  labelKey!: string

  @IsNumber()
  @Min(0)
  @Max(100)
  standardRatePercent!: number

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryReducedRateDto)
  reducedRates!: DeliveryReducedRateDto[]
}

class DomainDeliveryCountriesDto {
  @IsArray()
  @IsString({ each: true })
  sk!: string[]

  @IsArray()
  @IsString({ each: true })
  hu!: string[]

  @IsArray()
  @IsString({ each: true })
  at!: string[]
}

export class UpdateMarketSettingsDto {
  @IsOptional()
  @IsIn(['ua', 'sk'])
  region?: MarketRegion

  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultCurrency?: string

  @IsOptional()
  @IsIn(['ua_e164', 'sk_e164', 'intl'])
  authPhonePolicy?: PhonePolicy

  @IsOptional()
  @IsIn(['ua_e164', 'sk_e164', 'intl'])
  deliveryPhonePolicy?: PhonePolicy

  /** @deprecated Prefer authPhonePolicy; still accepted and mapped to auth when auth unset. */
  @IsOptional()
  @IsIn(['ua_e164', 'sk_e164', 'intl'])
  phonePolicy?: PhonePolicy

  @IsOptional()
  @IsIn(['disabled', 'soft', 'true_guest'])
  guestCheckoutMode?: GuestCheckoutMode

  @IsOptional()
  @IsIn(['local', 'external'])
  inventoryMode?: InventoryAuthorityMode

  @IsOptional()
  @IsBoolean()
  allowGuestReviews?: boolean

  @IsOptional()
  @IsBoolean()
  checkoutEmailRequired?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(20)
  privacyConsentVersion?: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  createAccountCheckboxLabel?: string

  @IsOptional()
  @IsBoolean()
  otpSmsLogin?: boolean

  @IsOptional()
  @IsBoolean()
  otpSmsCheckout?: boolean

  @IsOptional()
  @IsBoolean()
  otpSmsReview?: boolean

  @IsOptional()
  @IsBoolean()
  otpSmsProfile?: boolean

  @IsOptional()
  @IsBoolean()
  otpEmailLogin?: boolean

  @IsOptional()
  @IsBoolean()
  otpEmailCheckout?: boolean

  @IsOptional()
  @IsBoolean()
  otpEmailReview?: boolean

  @IsOptional()
  @IsBoolean()
  otpEmailProfile?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  authConsentText?: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountrySiteProfileDto)
  countrySites?: CountrySiteProfileDto[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryCountryCatalogEntryDto)
  deliveryCountryCatalog?: DeliveryCountryCatalogEntryDto[]

  @IsOptional()
  @ValidateNested()
  @Type(() => DomainDeliveryCountriesDto)
  domainDeliveryCountries?: DomainDeliveryCountriesDto

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  eurToHufRate?: number

  @IsOptional()
  @IsBoolean()
  applyDestinationVatB2c?: boolean

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sellerTaxRatePercent?: number

  @IsOptional()
  @IsIn(['ex_vat', 'inc_vat'])
  priceBasis?: PriceBasis

  @IsOptional()
  @IsIn(['inc_vat', 'ex_vat'])
  storefrontPrimaryPrice?: StorefrontPrimaryPrice

  @IsOptional()
  @IsBoolean()
  storefrontShowExVatSecondary?: boolean
}
