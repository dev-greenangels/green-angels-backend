import { IsOptional, IsString, MaxLength } from 'class-validator'

export class ProductCharacteristicsDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sunRequirement?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  soilType?: string

  @IsOptional()
  @IsString()
  @MaxLength(16)
  hardinessZone?: string

  @IsOptional()
  @IsString()
  @MaxLength(16)
  wateringNeeds?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  height?: string
}
