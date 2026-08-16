import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator'

const PRODUCT_IMAGE_PATH_PATTERN =
  /^\/uploads\/products\/(?:pending\/[a-f0-9-]+|[a-f0-9-]{36})\/[a-f0-9-]{36}\/main\.webp$/i

export class AttachProductImageItemDto {
  @IsString()
  productLegacyId!: string

  @IsString()
  imageLegacyId!: string

  @IsString()
  @MaxLength(500)
  @Matches(PRODUCT_IMAGE_PATH_PATTERN, {
    message: 'Некоректний шлях зображення товару.',
  })
  url!: string

  @IsBoolean()
  isMain!: boolean

  @IsNumber()
  @Type(() => Number)
  sortOrder!: number
}

export class AttachProductImagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttachProductImageItemDto)
  images!: AttachProductImageItemDto[]
}

export class AttachBlogCoverItemDto {
  @IsString()
  blogLegacyId!: string

  @IsString()
  @MaxLength(500)
  imageUrl!: string
}

export class AttachBlogCoversDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttachBlogCoverItemDto)
  items!: AttachBlogCoverItemDto[]
}
