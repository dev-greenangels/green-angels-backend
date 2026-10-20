import { PromoEligibleAudience } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator'

import { UpsertDiscountRuleDto } from './upsert-discount-rule.dto'

export class PreviewDiscountRuleDto {
  @IsUUID()
  productVariantId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number

  @IsEnum(PromoEligibleAudience)
  audience!: PromoEligibleAudience

  /**
   * Auth preview axis (independent of commercial audience).
   * GUEST = no userId; REGISTERED = signed-in (sentinel or previewUserId).
   * Omit → GUEST for RETAIL without previewUserId; REGISTERED when previewUserId / WHOLESALER.
   */
  @IsOptional()
  @IsIn(['GUEST', 'REGISTERED'])
  registrationPreview?: 'GUEST' | 'REGISTERED'

  /**
   * Optional WHOLESALER customer — loads real Role / ContractorProfile / Flexi codes
   * into the same pricing audience as checkout. Without this, COMPANY prices are not claimed.
   * For RETAIL + REGISTERED, optional real USER id (else sentinel without allowlist match).
   */
  @IsOptional()
  @IsUUID()
  previewUserId?: string

  /** Optional unsaved rule merged into candidates (same shape as create/update). */
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertDiscountRuleDto)
  draftRule?: UpsertDiscountRuleDto
}
