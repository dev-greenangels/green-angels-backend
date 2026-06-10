import { IsEmail, IsOptional, IsString } from 'class-validator'

export class PhoneSessionDto {
  @IsString()
  phone!: string

  @IsOptional()
  @IsEmail()
  email?: string
}
