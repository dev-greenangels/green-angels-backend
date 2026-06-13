import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class CreateCustomerGroupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string

  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/, { message: 'Slug: лише малі латинські літери, цифри та дефіс.' })
  slug!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
