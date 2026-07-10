import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export class UpdateRedirectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  fromPath?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  toPath?: string

  @IsOptional()
  @IsInt()
  @IsIn([301, 302, 307, 308])
  statusCode?: number

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(120)
  prefix?: string
}
