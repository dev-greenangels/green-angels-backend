import {
  BuyerRegistrationScope,
  DiscountApplicationScope,
  DiscountTarget,
  DiscountValueType,
  PromoApplicationScope,
  PromoDiscountCombinationMode,
  PromoEligibleAudience,
  PromoEligiblePriceSource,
  PromoStackingMode,
} from '@prisma/client'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator'

@ValidatorConstraint({ name: 'promoHasBenefit', async: false })
class PromoHasBenefitConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments) {
    const dto = args.object as UpsertPromoCodeDto
    const hasDiscount = dto.discountType != null && dto.value != null
    const hasGift = Boolean(dto.giftVariantId?.trim())
    return hasDiscount || hasGift
  }

  defaultMessage() {
    return 'Оберіть знижку (тип і значення) або подарунковий товар.'
  }
}

export class UpsertPromoCodeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  code!: string

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @Validate(PromoHasBenefitConstraint)
  private readonly _benefitCheck?: unknown

  @IsOptional()
  @IsIn([DiscountValueType.PERCENT, DiscountValueType.FIXED])
  discountType?: DiscountValueType

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999)
  value?: number

  @IsOptional()
  @IsEnum(DiscountApplicationScope)
  discountApplicationScope?: DiscountApplicationScope

  @IsOptional()
  @IsEnum(PromoDiscountCombinationMode)
  combinesWithOtherDiscounts?: PromoDiscountCombinationMode

  @IsOptional()
  @IsEnum(PromoStackingMode)
  stackingMode?: PromoStackingMode

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  compatiblePromoCodeIds?: string[]

  @IsEnum(DiscountTarget)
  target!: DiscountTarget

  @IsOptional()
  @IsUUID()
  targetId?: string

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  targetIds?: string[]

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludeProductIds?: string[]

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludeVariantIds?: string[]

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludeCategoryIds?: string[]

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  groupIds?: string[]

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  userIds?: string[]

  /** At least one audience required when provided. Omit → legacy default (retail+wholesale). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(PromoEligibleAudience, { each: true })
  eligibleAudiences?: PromoEligibleAudience[]

  /** Auth gate. Omit → ANY (legacy). Orthogonal to eligibleAudiences. */
  @IsOptional()
  @IsEnum(BuyerRegistrationScope)
  buyerRegistrationScope?: BuyerRegistrationScope

  /** At least one price source required when provided. Omit → legacy default (ALL+GROUP+COMPANY). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(PromoEligiblePriceSource, { each: true })
  eligiblePriceSources?: PromoEligiblePriceSource[]

  /** PRODUCTS | PRODUCTS_AND_SHIPPING | SHIPPING_ONLY. Default PRODUCTS. */
  @IsOptional()
  @IsEnum(PromoApplicationScope)
  applicationScope?: PromoApplicationScope

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minCartSubtotal?: number

  @IsOptional()
  @IsUUID()
  giftVariantId?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  giftQuantity?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimitTotal?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimitPerUser?: number

  @IsOptional()
  @IsISO8601()
  validFrom?: string

  @IsOptional()
  @IsISO8601()
  validTo?: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
