import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { PromoEligibleAudience, Role } from '@prisma/client'

import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator'
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { SettingsService } from '../settings/settings.service'
import { PreviewVariantPriceDto } from './dto/preview-variant-price.dto'
import { PricingService } from './pricing.service'

/**
 * Product Editor final-price preview.
 * Does NOT open DiscountRules mutations — promotions.manage OR catalog.view|edit.
 */
@Controller('backstage/pricing')
@UseGuards(BackstageJwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.MANAGER)
export class BackstageVariantPricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
  ) {}

  @Post('variant-preview')
  @RequirePermissions('catalog.view', 'catalog.edit', 'promotions.manage')
  async variantPreview(@Body() dto: PreviewVariantPriceDto) {
    const market = await this.settings.getMarketSettings()
    const role =
      dto.audience === PromoEligibleAudience.WHOLESALER ? Role.WHOLESALER : Role.USER
    const registrationPreview =
      dto.registrationPreview ??
      (dto.previewUserId || dto.audience === PromoEligibleAudience.WHOLESALER
        ? 'REGISTERED'
        : 'GUEST')

    return this.pricing.previewCommercialLine({
      productVariantId: dto.productVariantId,
      quantity: dto.quantity,
      audienceRole: role,
      draftRule: null,
      previewUserId: dto.previewUserId,
      registrationPreview,
      flexiSkupCenKod: market.salesPricesWholesalerGroupKod?.trim() || null,
      flexiFirmaKod: null,
    })
  }
}
