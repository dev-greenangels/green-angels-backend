import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator'

export class BulkMatrixCellUpdateDto {
  @IsUUID()
  productId!: string

  @IsUUID()
  characteristicId!: string

  @IsOptional()
  @IsUUID()
  optionId?: string

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  optionIds?: string[]

  @IsOptional()
  @IsString()
  textValue?: string

  @IsOptional()
  @IsNumber()
  numberValue?: number

  @IsOptional()
  @IsBoolean()
  clear?: boolean
}

export class BulkUpdateBulkMatrixDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkMatrixCellUpdateDto)
  updates!: BulkMatrixCellUpdateDto[]

  @IsOptional()
  @IsString()
  locale?: string
}
