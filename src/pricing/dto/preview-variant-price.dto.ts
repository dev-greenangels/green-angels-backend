import { PromoEligibleAudience } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsEnum, IsIn, IsInt, IsOptional, IsUUID, Min } from 'class-validator'

/** Read-only commercial preview for Product Editor (no draft DiscountRule). */
export class PreviewVariantPriceDto {
  @IsUUID()
  productVariantId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number

  @IsEnum(PromoEligibleAudience)
  audience!: PromoEligibleAudience

  @IsOptional()
  @IsIn(['GUEST', 'REGISTERED'])
  registrationPreview?: 'GUEST' | 'REGISTERED'

  /** Real WHOLESALER with ContractorProfile for COMPANY-exact preview. */
  @IsOptional()
  @IsUUID()
  previewUserId?: string
}
