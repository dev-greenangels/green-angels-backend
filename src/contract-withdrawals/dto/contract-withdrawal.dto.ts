import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
  ContractWithdrawalRefundMethod,
  ContractWithdrawalScope,
  ContractWithdrawalStatus,
} from '@prisma/client'

const WITHDRAWAL_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'ACCEPTED',
  'REJECTED',
  'CLOSED',
  'WAITING_FOR_RETURN',
  'RETURN_RECEIVED',
  'REFUND_PENDING',
  'REFUNDED',
  'CANCELLED',
] as const

const REFUND_METHODS = [
  'ORIGINAL_PAYMENT_METHOD',
  'BANK_TRANSFER',
  'CASH_OR_COD_MANUAL',
  'OTHER',
] as const

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
  @IsIn([...WITHDRAWAL_STATUSES])
  status?: (typeof WITHDRAWAL_STATUSES)[number]

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

/** Manual ops update — never triggers payment provider refunds. */
export class UpdateContractWithdrawalBackstageDto {
  @IsIn([...WITHDRAWAL_STATUSES])
  status!: ContractWithdrawalStatus

  @IsOptional()
  @IsBoolean()
  refundRequired?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  refundAmount?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(3)
  refundCurrency?: string | null

  @IsOptional()
  @IsIn([...REFUND_METHODS])
  refundMethod?: ContractWithdrawalRefundMethod | null

  @IsOptional()
  @IsString()
  @MaxLength(120)
  refundReference?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  internalNote?: string | null

  /** Explicit confirm when marking REFUNDED (manual money already returned). */
  @ValidateIf((o: UpdateContractWithdrawalBackstageDto) => o.status === 'REFUNDED')
  @IsBoolean()
  confirmRefundCompleted?: boolean
}
