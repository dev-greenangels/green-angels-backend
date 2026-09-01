import { Type } from 'class-transformer'
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator'

export class ProductCharacteristicEntryDto {
  @IsUUID()
  characteristicId!: string

  @IsOptional()
  @IsUUID()
  optionId?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  textValue?: string

  @IsOptional()
  @IsNumber()
  numberValue?: number
}

export class ProductCharacteristicsDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductCharacteristicEntryDto)
  entries?: ProductCharacteristicEntryDto[]

  /** @deprecated використовуйте entries */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sunRequirement?: string

  /** @deprecated використовуйте entries */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  soilType?: string

  /** @deprecated використовуйте entries */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  hardinessZone?: string

  /** @deprecated використовуйте entries */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  wateringNeeds?: string

  /** @deprecated використовуйте entries */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  height?: string
}

export type ProductCharacteristicEntryResponse = {
  characteristicId: string
  characteristicSlug: string
  characteristicName: string
  valueType: string
  optionId?: string
  optionSlug?: string
  optionLabel?: string
  textValue?: string
  numberValue?: number
}

export type ProductCharacteristicsResponse = {
  entries: ProductCharacteristicEntryResponse[]
}

export type ProductDisplayCharacteristic = {
  id: string
  slug: string
  name: string
  icon: string | null
  unit: string | null
  valueType: string
  displayValue: string
  colorHex?: string | null
  colorDisplayMode?: 'TEXT' | 'SWATCH' | 'BOTH' | null
  colorOptions?: Array<{ displayValue: string; colorHex: string | null }>
  sortOrder: number
}
