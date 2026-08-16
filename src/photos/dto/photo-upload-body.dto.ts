import { IsIn, IsOptional, IsString, IsNotEmpty } from 'class-validator'

export class PhotoUploadBodyDto {
  @IsString()
  @IsNotEmpty()
  plantName!: string

  @IsString()
  @IsNotEmpty()
  plantSize!: string

  @IsString()
  @IsNotEmpty()
  sizeId!: string

  /** Legacy RN Estimate field — EAN. Empty string is allowed when sku is set. */
  @IsOptional()
  @IsString()
  barcode?: string

  @IsOptional()
  @IsString()
  sku?: string

  @IsOptional()
  @IsString()
  identifier?: string

  @IsOptional()
  @IsIn(['ean', 'sku', 'EAN', 'SKU'])
  identifierType?: string

  @IsString()
  @IsNotEmpty()
  productId!: string

  @IsString()
  storageName!: string

  @IsString()
  @IsNotEmpty()
  viberSend!: string
}
