import { IsEmail, IsIn, IsOptional, IsString, ValidateIf } from 'class-validator'

export class SendOtpDto {
  @ValidateIf((dto: SendOtpDto) => !dto.email)
  @IsString()
  phone?: string

  @ValidateIf((dto: SendOtpDto) => !dto.phone)
  @IsEmail()
  email?: string

  @IsOptional()
  @IsIn(['login', 'checkout', 'review', 'profile'])
  purpose?: 'login' | 'checkout' | 'review' | 'profile'

  /** SK storefront host country site; omit on UA. Never derived from delivery/tax. */
  @IsOptional()
  @IsIn(['sk', 'hu', 'at'])
  countrySiteCode?: 'sk' | 'hu' | 'at'
}
