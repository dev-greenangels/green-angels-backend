import { Type } from 'class-transformer'
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator'

export class PatchOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  status?: string

  @ValidateIf((o: PatchOrderDto) => o.status?.toUpperCase() === 'CANCELLED')
  @IsUUID()
  cancellationReasonId?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cancellationNote?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(64)
  trackingNumber?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(64)
  trackingCarrier?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(64)
  npDocumentRef?: string | null
}

/** Kept for backward-compatible clients that only send { status } */
export class PatchOrderStatusDto {
  @IsString()
  @MaxLength(64)
  status!: string

  @ValidateIf((o: PatchOrderStatusDto) => o.status?.toUpperCase() === 'CANCELLED')
  @IsUUID()
  cancellationReasonId?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cancellationNote?: string | null
}

export class SyncOrderTrackingDto {
  @IsOptional()
  @IsIn(['nova-poshta'])
  carrier?: 'nova-poshta'
}
