import { IsUUID } from 'class-validator'

export class ToggleFavoriteDto {
  @IsUUID()
  productId!: string
}
