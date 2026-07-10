import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator'

export class UpdateReviewReplyDto {
  @ValidateIf((dto: UpdateReviewReplyDto) => dto.text !== null && dto.text !== undefined && dto.text !== '')
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  authorName!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string | null
}
