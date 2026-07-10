import { IsEmail, IsUUID } from 'class-validator'

export class EmailSessionDto {
  @IsEmail()
  email!: string

  @IsUUID()
  verificationToken!: string
}
