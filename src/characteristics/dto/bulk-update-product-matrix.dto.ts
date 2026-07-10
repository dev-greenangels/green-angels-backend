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

export class ProductMatrixUpdateItemDto {
  @IsUUID()
  productId!: string

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

export class BulkUpdateProductMatrixDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMatrixUpdateItemDto)
  updates!: ProductMatrixUpdateItemDto[]

  @IsOptional()
  @IsString()
  locale?: string
}
