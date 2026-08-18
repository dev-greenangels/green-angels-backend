import { IsEnum } from 'class-validator'
import { WholesaleInquiryStatus } from '@prisma/client'

export class UpdateWholesaleInquiryStatusDto {
  @IsEnum(WholesaleInquiryStatus)
  status!: WholesaleInquiryStatus
}
