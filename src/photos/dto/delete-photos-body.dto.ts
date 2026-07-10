import { ArrayNotEmpty, IsArray, IsString } from 'class-validator'

export class DeletePhotosBodyDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[]
}
