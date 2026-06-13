import { IsString, MinLength } from 'class-validator'

export class GoogleOAuthCallbackDto {
  @IsString()
  @MinLength(1)
  code!: string

  @IsString()
  @MinLength(1)
  redirectUri!: string
}
