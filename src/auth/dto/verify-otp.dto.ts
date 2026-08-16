import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator'

export class VerifyOtpDto {
  @ValidateIf((dto: VerifyOtpDto) => !dto.email)
  @IsString()
  phone?: string

  @ValidateIf((dto: VerifyOtpDto) => !dto.phone)
  @IsEmail()
  email?: string

  @IsString()
  @Length(6, 6)
  @Matches(/^\d+$/)
  code!: string

  @IsOptional()
  @IsIn(['login', 'checkout', 'review', 'profile'])
  purpose?: 'login' | 'checkout' | 'review' | 'profile'
}
