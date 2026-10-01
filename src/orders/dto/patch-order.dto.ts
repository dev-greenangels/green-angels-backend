import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator'

/**
 * Backstage order patch — operational fields only.
 *
 * INVARIANT: deliveryCountryCode / taxRegime / taxRatePercent / taxAmount are
 * intentionally absent. For intra-EU B2B, delivery country is tax-relevant;
 * mutating it after checkout would invalidate a reverse_charge snapshot.
 * If delivery-country editing is added in the future, require an explicit tax review.
 */
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

  @IsOptional()
  @IsBoolean()
  onlineWithdrawalActionEnabled?: boolean
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
