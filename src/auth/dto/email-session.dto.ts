import { IsEmail, IsIn, IsOptional, IsUUID } from 'class-validator'

import {
  SESSION_OTP_PURPOSES,
  type SessionOtpPurpose,
} from '../session-otp-purpose'

export class EmailSessionDto {
  @IsEmail()
  email!: string

  @IsUUID()
  verificationToken!: string

  /** OTP purpose used when the code was verified. Defaults to login. */
  @IsOptional()
  @IsIn([...SESSION_OTP_PURPOSES])
  purpose?: SessionOtpPurpose
}
