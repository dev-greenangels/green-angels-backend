import { DiscountValueType, Role } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

export class UpsertReferralProgramDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsEnum(DiscountValueType)
  refereeDiscountType!: DiscountValueType

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999)
  refereeDiscountValue!: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  referrerPoints?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minOrderSubtotal?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxRefereeDiscount?: number

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludeProductIds?: string[]

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludeCategoryIds?: string[]

  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  onlyForRoles?: Role[]

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  groupIds?: string[]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  cookieDays?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pointsExpireDays?: number
}
