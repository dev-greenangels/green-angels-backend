import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator'

export class MergeFavoritesDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  productIds!: string[]
}
