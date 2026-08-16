import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator'
import { Type } from 'class-transformer'

export class ClaimGuestOrderDto {
  /** Numeric order number (without ZY- prefix) or full display number */
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  orderNumber!: string

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string

  @IsOptional()
  @IsString()
  @MaxLength(180)
  email?: string
}

export class ClaimGuestOrderByIdDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderNumber!: number
}
