import { DiscountTarget, DiscountValueType } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsEnum,
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
  @IsEnum(DiscountValueType)
  discountType?: DiscountValueType

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999)
  value?: number

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
  groupIds?: string[]

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  userIds?: string[]

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
