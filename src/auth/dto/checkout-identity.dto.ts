import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator'

export class CheckoutIdentityDto {
  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsUUID()
  verificationToken!: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  firstName?: string

  @IsOptional()
  @IsString()
  @MinLength(2)
  lastName?: string
}
