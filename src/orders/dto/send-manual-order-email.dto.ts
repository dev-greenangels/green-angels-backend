import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class SendManualOrderEmailDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string

  @IsOptional()
  @IsBoolean()
  attachConfirmationPdf?: boolean

  /** Client-generated nonce — same value on double-click prevents duplicate sends. */
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  idempotencyKey!: string
}
