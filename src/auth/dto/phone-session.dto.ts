import { IsOptional, IsString, IsUUID } from 'class-validator'

export class PhoneSessionDto {
  @IsString()
  phone!: string

  @IsOptional()
  @IsUUID()
  verificationToken?: string
}
