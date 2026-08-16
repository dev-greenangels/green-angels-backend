import { IsString, Matches, MaxLength, MinLength } from 'class-validator'

export class ValidateVatDto {
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'Код країни має містити 2 букви (напр. SK).' })
  countryCode!: string

  @IsString()
  @MinLength(2)
  @MaxLength(20)
  vatNumber!: string
}
