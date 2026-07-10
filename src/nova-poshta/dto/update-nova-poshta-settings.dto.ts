import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator'

export class NpHumanScheduleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(59)
  minute?: number

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  daysOfWeek?: number[]

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number | null
}

export class NpAutoSyncSchedulesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => NpHumanScheduleDto)
  all?: NpHumanScheduleDto

  @IsOptional()
  @ValidateNested()
  @Type(() => NpHumanScheduleDto)
  settlements?: NpHumanScheduleDto

  @IsOptional()
  @ValidateNested()
  @Type(() => NpHumanScheduleDto)
  warehouses?: NpHumanScheduleDto

  @IsOptional()
  @ValidateNested()
  @Type(() => NpHumanScheduleDto)
  warehouse_types?: NpHumanScheduleDto
}

export class NpAutoSyncConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsIn(['all', 'separate'])
  mode?: 'all' | 'separate'

  @IsOptional()
  @ValidateNested()
  @Type(() => NpAutoSyncSchedulesDto)
  schedules?: NpAutoSyncSchedulesDto
}

export class NpSyncPageSizesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(150)
  settlements?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6500)
  warehouses?: number
}

export class UpdateNovaPoshtaSettingsDto {
  @IsOptional()
  @IsString()
  apiKey?: string

  @IsOptional()
  @IsString()
  jsonApiUrl?: string

  /** @deprecated Use syncPageSizes */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  syncPageSize?: number

  @IsOptional()
  @ValidateNested()
  @Type(() => NpSyncPageSizesDto)
  syncPageSizes?: NpSyncPageSizesDto

  @IsOptional()
  @ValidateNested()
  @Type(() => NpAutoSyncConfigDto)
  autoSync?: NpAutoSyncConfigDto
}
