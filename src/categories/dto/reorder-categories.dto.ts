import { ArrayNotEmpty, IsArray, IsOptional, IsUUID, ValidateIf } from 'class-validator'

export class ReorderCategoriesDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  parentId?: string | null

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  orderedIds!: string[]
}
