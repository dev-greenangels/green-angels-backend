import { IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator'

export class EanCacheItem {
  /** Legacy RN Estimate cache key — EAN. Optional when `sku` is set. */
  @ValidateIf((item: EanCacheItem) => !item.sku?.trim())
  @IsString()
  @IsNotEmpty()
  ean?: string

  @IsOptional()
  @IsString()
  sku?: string | null

  @IsString()
  @IsOptional()
  cached_google_id?: string | null
}
