import { IsBoolean } from 'class-validator'

export class PatchProductPublishedDto {
  @IsBoolean()
  isPublished!: boolean
}
