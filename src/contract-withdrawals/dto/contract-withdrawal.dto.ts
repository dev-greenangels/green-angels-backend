import {
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import { ContractWithdrawalScope } from '@prisma/client'

export class CreatePublicContractWithdrawalDto {
  @IsString()
  @MaxLength(120)
  customerName!: string

  @IsEmail()
  @MaxLength(254)
  email!: string

  @IsString()
  @MaxLength(64)
  orderNumber!: string

  @IsEnum(ContractWithdrawalScope)
  scope!: ContractWithdrawalScope

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  partialItemsText?: string

  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string

  /** Honeypot — silently accept */
  @IsOptional()
  @IsString()
  fax?: string

  @IsOptional()
  startedAt?: number
}

export class ContractWithdrawalLineSelectionDto {
  @IsUUID()
  orderItemId!: string

  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number
}

export class CreateAccountContractWithdrawalDto {
  @IsUUID()
  orderId!: string

  @IsEnum(ContractWithdrawalScope)
  scope!: ContractWithdrawalScope

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractWithdrawalLineSelectionDto)
  lineItems?: ContractWithdrawalLineSelectionDto[]

  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string
}

export class ContractWithdrawalQueryDto {
  @IsOptional()
  @IsIn(['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CLOSED'])
  status?: 'SUBMITTED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'CLOSED'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number
}

export class UpdateContractWithdrawalStatusDto {
  @IsIn(['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CLOSED'])
  status!: 'SUBMITTED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'CLOSED'
}
