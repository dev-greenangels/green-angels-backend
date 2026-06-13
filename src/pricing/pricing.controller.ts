import { Body, Controller, Post } from '@nestjs/common'

import { SettingsService } from '../settings/settings.service'
import { computeCheckoutTotals } from './checkout-totals'
import { QuotePricingDto } from './dto/quote-pricing.dto'
import { PricingService } from './pricing.service'

@Controller('pricing')
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
  ) {}

  @Post('quote')
  async quote(@Body() dto: QuotePricingDto) {
    const audience = await this.pricing.resolveAudience({
      customerPhone: dto.customerPhone,
      userId: dto.userId,
    })
    const quote = await this.pricing.quote({
      items: dto.items,
      audience,
      promoCode: dto.promoCode,
      validatePromo: true,
    })

    const cartSettings = await this.settings.getCartCheckoutSettings()
    const checkout = computeCheckoutTotals({
      productsSubtotal: quote.totalAmount,
      subtotalBeforeDiscount: quote.subtotalBeforeDiscount,
      settings: cartSettings,
      deliveryMethod: dto.deliveryMethod,
    })

    return {
      ...quote,
      checkout,
    }
  }
}
