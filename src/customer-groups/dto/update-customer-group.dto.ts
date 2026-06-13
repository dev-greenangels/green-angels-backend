import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class UpdateCustomerGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/)
  slug?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
