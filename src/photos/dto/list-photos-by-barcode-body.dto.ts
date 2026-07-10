import { IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class EanCacheItem {
  @IsString()
  @IsNotEmpty()
  ean!: string

  @IsString()
  @IsOptional()
  cached_google_id?: string | null
}
