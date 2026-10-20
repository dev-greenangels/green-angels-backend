import {
  BuyerRegistrationScope,
  DiscountRuleCombinationMode,
  DiscountTarget,
  DiscountValueType,
  PromoEligibleAudience,
  Role,
} from '@prisma/client'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
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
  ValidateNested,
} from 'class-validator'

export class DiscountRuleQuantityTierDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minQuantity!: number

  @IsEnum(DiscountValueType)
  type!: DiscountValueType

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999)
  value!: number
}

export class DiscountRuleAttributeFilterGroupDto {
  @IsUUID()
  attributeId!: string

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  valueIds!: string[]
}

export class DiscountRuleCharacteristicFilterGroupDto {
  @IsUUID()
  characteristicId!: string

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  optionIds?: string[]

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  numberMin?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  numberMax?: number
}

export class DiscountRuleFilterCriteriaDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiscountRuleAttributeFilterGroupDto)
  attributeGroups?: DiscountRuleAttributeFilterGroupDto[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiscountRuleCharacteristicFilterGroupDto)
  characteristicGroups?: DiscountRuleCharacteristicFilterGroupDto[]
}

export class UpsertDiscountRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string

  @IsEnum(DiscountTarget)
  target!: DiscountTarget

  /** Sole discount source. At least one tier required. */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DiscountRuleQuantityTierDto)
  quantityTiers!: DiscountRuleQuantityTierDto[]

  @IsOptional()
  @IsUUID()
  targetId?: string

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  targetIds?: string[]

  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  onlyForRoles?: Role[]

  /** New rules default to [RETAIL] in service when omitted. */
  @IsOptional()
  @IsArray()
  @IsEnum(PromoEligibleAudience, { each: true })
  eligibleAudiences?: PromoEligibleAudience[]

  /** Auth gate. Omit → ANY (legacy). Orthogonal to eligibleAudiences. */
  @IsOptional()
  @IsEnum(BuyerRegistrationScope)
  buyerRegistrationScope?: BuyerRegistrationScope

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  groupIds?: string[]

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  allowedUserIds?: string[]

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
  @ValidateNested()
  @Type(() => DiscountRuleFilterCriteriaDto)
  filterCriteria?: DiscountRuleFilterCriteriaDto | null

  @IsOptional()
  @IsEnum(DiscountRuleCombinationMode)
  combinesWithOtherDiscounts?: DiscountRuleCombinationMode

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minCartSubtotal?: number

  @IsOptional()
  @IsISO8601()
  startDate?: string

  @IsOptional()
  @IsISO8601()
  endDate?: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
