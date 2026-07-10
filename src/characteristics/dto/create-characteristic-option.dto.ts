import { IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator'

export class CreateCharacteristicOptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug опції: малі латинські літери, цифри, дефіси',
  })
  slug?: string

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number
}
