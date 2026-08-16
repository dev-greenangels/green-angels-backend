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
}
