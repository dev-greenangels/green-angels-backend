import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator'

export class StartEmailContactDto {
  @IsEmail()
  email!: string

  @IsOptional()
  @IsIn(['sk', 'hu', 'at'])
  countrySiteCode?: 'sk' | 'hu' | 'at'
}

export class StartPhoneContactDto {
  @IsString()
  @MinLength(5)
  phone!: string
}

export class ConfirmContactDto {
  @IsString()
  @MinLength(10)
  verificationToken!: string
}
