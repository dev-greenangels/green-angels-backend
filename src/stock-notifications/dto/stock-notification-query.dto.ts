import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

export class StockNotificationQueryDto {
  @IsOptional()
  @IsIn(['pending', 'notified', 'all'])
  status?: 'pending' | 'notified' | 'all'

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string

  @IsOptional()
  @IsIn(['email', 'phone', 'all'])
  channel?: 'email' | 'phone' | 'all'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number
}
