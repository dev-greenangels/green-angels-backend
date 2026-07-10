import { IsNotEmpty, IsString } from 'class-validator'

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

  @IsString()
  barcode!: string

  @IsString()
  @IsNotEmpty()
  productId!: string

  @IsString()
  storageName!: string

  @IsString()
  @IsNotEmpty()
  viberSend!: string
}
