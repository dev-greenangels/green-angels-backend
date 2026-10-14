import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator'

export class UpdatePlantStockSettingsDto {
  @IsOptional()
  @IsBoolean()
  integrationEnabled?: boolean

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceReservationCompanyCode?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  serviceReservationComment?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  allowedWarehouseCodes?: string[]

  /** Accepted for storage but posting stays disabled until product unlock. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  inventoryTypDoklId?: string | null
}

export class PlantStockCatalogQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string

  @IsOptional()
  @IsString()
  @MaxLength(40)
  skladKod?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number
}

export class PlantStockStockQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sku!: string

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  skladKod!: string
}

/** Comma-separated SKUs — resolved from PlantStockStockCache (0 ABRA GET). */
export class PlantStockStockBatchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  skladKod!: string

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  skus!: string
}

export class PlantStockReservationsQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sku!: string

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  skladKod!: string
}

export class ReservationPreviewLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sku!: string

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  currentQty!: number

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  freeQty!: number
}

export class ReservationPreviewBodyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  skladKod!: string

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReservationPreviewLineDto)
  lines!: ReservationPreviewLineDto[]
}
