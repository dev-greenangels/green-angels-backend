import { IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator'

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
