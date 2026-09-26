import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator'

function emptyToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Validated checkout-draft body. No cartId — ownership is cookie/JWT only.
 * Mirrors CheckoutDraftV1 recoverable fields (no consents / totals / secrets).
 */
export class UpdateCheckoutDraftDto {
  /** Version discriminator from CheckoutDraftV1; optional (server normalizes to v:1). */
  @IsOptional()
  @Type(() => Number)
  @IsIn([1])
  v?: 1

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(8)
  locale?: string

  @IsOptional()
  @IsIn(['sk', 'hu', 'at'])
  countryCode?: 'sk' | 'hu' | 'at'

  @IsOptional()
  @IsIn(['individual', 'company'])
  buyerType?: 'individual' | 'company'

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(2)
  vatCountryCode?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(32)
  companyVatId?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  firstName?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  lastName?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  patronymic?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  email?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(30)
  phone?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(30)
  deliveryPhone?: string

  @IsOptional()
  @IsBoolean()
  isOtherRecipient?: boolean

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  recipientFirstName?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  recipientLastName?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  recipientPatronymic?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(30)
  recipientPhone?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  recipientCompanyName?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(80)
  deliveryMethod?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(8)
  deliveryCountryCode?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  city?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  cityLabel?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(500)
  postOffice?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(500)
  postOfficeLabel?: string

  @IsOptional()
  @IsIn(['', 'branch', 'box', 'carrier'])
  packetaPickupKind?: '' | 'branch' | 'box' | 'carrier'

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  packetaCarrierId?: number | null

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  street?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  streetLabel?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(50)
  houseNumber?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(20)
  postalCode?: string

  @IsOptional()
  @IsBoolean()
  deliveryAddressSameAsBilling?: boolean

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  billingFirstName?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(100)
  billingLastName?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  billingStreet?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(50)
  billingHouseNumber?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(120)
  billingCity?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(32)
  billingPostalCode?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(8)
  billingCountryCode?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(80)
  paymentMethod?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(32)
  companyEdrpou?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(300)
  companyLegalName?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(32)
  companyDic?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(200)
  companyStreet?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(120)
  companyCity?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(32)
  companyPostalCode?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(10)
  preferredShipDate?: string

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(10)
  preferredShipDateImmediate?: string

  @IsOptional()
  @IsIn(['together', 'split'])
  shipmentSplitMode?: 'together' | 'split'

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(2000)
  comment?: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  promoCodes?: string[]
}
