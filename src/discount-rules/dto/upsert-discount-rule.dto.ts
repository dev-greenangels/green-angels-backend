import { DiscountTarget, DiscountValueType, Role } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'

export class UpsertDiscountRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string

  @IsEnum(DiscountValueType)
  type!: DiscountValueType

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999)
  value!: number

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
  @IsEnum(Role, { each: true })
  onlyForRoles?: Role[]

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  groupIds?: string[]

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
