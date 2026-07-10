import { IsNotEmpty, IsString } from 'class-validator'

export class ListPhotosQueryDto {
  @IsString()
  @IsNotEmpty()
  productId!: string
}
