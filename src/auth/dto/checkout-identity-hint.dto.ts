import { IsEmail, IsOptional, IsString } from 'class-validator'

export class CheckoutIdentityHintDto {
  @IsOptional()
  @IsEmail()
  email?: string

  @IsOptional()
  @IsString()
  phone?: string
}
