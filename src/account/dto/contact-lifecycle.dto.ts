import { IsEmail, IsString, MinLength } from 'class-validator'

export class StartEmailContactDto {
  @IsEmail()
  email!: string
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
