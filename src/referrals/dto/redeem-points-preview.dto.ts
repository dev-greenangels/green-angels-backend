import { Type } from 'class-transformer'
import { IsInt, Min } from 'class-validator'

export class RedeemPointsPreviewDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  points!: number
}
