import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common'
import type { Request } from 'express'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard'
import { SettingsService } from '../settings/settings.service'
import { computeCheckoutTotals } from './checkout-totals'
import { QuotePricingDto } from './dto/quote-pricing.dto'
import { PricingService } from './pricing.service'
import { convertEurToHuf, pickCartCnCode, resolveCheckoutTax } from './tax-regime'
import { roundMoney } from './pricing.helpers'

function mapHuf(amount: number, rate: number): number {
  return convertEurToHuf(amount, rate)
}

@Controller('pricing')
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
  ) {}

  @Post('quote')
  @UseGuards(OptionalJwtAuthGuard)
  async quote(
    @Body() dto: QuotePricingDto,
    @Req() req: Request & { user?: SessionJwtPayload },
  ) {
    // Audience тільки з сесії: гість = retail; персональні ціни/знижки — після логіну.
    // dto.userId / dto.customerPhone ігноруємо (не довіряємо клієнту).
    const audience = await this.pricing.resolveAudience({
      userId: req.user?.userId,
    })
    const quote = await this.pricing.quote({
      items: dto.items,
      audience,
      promoCode: dto.promoCode,
      promoCodes: dto.promoCodes,
      validatePromo: true,
      splitOrderParts: dto.splitOrderParts,
      splitOrderPartIndex: dto.splitOrderPartIndex,
    })

    const cartSettings = await this.settings.getCartCheckoutSettings()
    const market = await this.settings.getMarketSettings()
    const cnByVariant = await this.pricing.getCnCodesForVariantIds(
      quote.lines.map((line) => line.productVariantId),
    )
    const cnCode =
      dto.cnCode?.trim() ||
      pickCartCnCode(
        quote.lines.map((line) => cnByVariant.get(line.productVariantId) ?? null),
        market,
      )
    const tax = resolveCheckoutTax({
      market,
      countryCode: dto.countryCode,
      deliveryCountryCode: dto.deliveryCountryCode,
      cnCode,
      buyerType: dto.buyerType,
      vatCountryCode: dto.vatCountryCode,
      viesValid: dto.viesValid,
      fallbackTaxRatePercent: cartSettings.taxRatePercent,
      fallbackTaxIncluded: cartSettings.taxIncluded,
    })

    let checkout = computeCheckoutTotals({
      productsSubtotal: quote.totalAmount,
      subtotalBeforeDiscount: quote.subtotalBeforeDiscount,
      settings: {
        ...cartSettings,
        taxAppliesToFees: market.region === 'sk' ? true : cartSettings.taxAppliesToFees,
        // Prefer ?? so reverse_charge rate 0 is not replaced by cart fallback.
        taxRatePercent: tax.taxRatePercent ?? cartSettings.taxRatePercent,
        taxIncluded: tax.taxIncluded,
      },
      deliveryMethod: dto.deliveryMethod,
      paymentMethod: dto.paymentMethod,
      cartWeightKg: quote.cartWeightKg,
      cartSizeEnvelope: quote.cartSizeEnvelope,
      cartVolumeL: quote.cartVolumeL,
      audienceRole: audience.role,
      taxOverride: tax,
    })

    // HUF conversion is for HU *site* currency, not delivery destination.
    // Selecting Hungary as ship-to on an EUR shop must keep EUR totals (FX is client-side on HU domain).
    let currency = market.defaultCurrency
    let fxRateUsed: number | null = null
    let totalAmount = quote.totalAmount
    let subtotalBeforeDiscount = quote.subtotalBeforeDiscount

    if (market.defaultCurrency === 'HUF') {
      const rate = market.eurToHufRate
      fxRateUsed = rate
      currency = 'HUF'
      totalAmount = mapHuf(quote.totalAmount, rate)
      subtotalBeforeDiscount = mapHuf(quote.subtotalBeforeDiscount, rate)
      const taxAdds = checkout.showTax && !checkout.taxIncluded
      checkout = {
        ...checkout,
        productsSubtotal: mapHuf(checkout.productsSubtotal, rate),
        discountAmount: mapHuf(checkout.discountAmount, rate),
        deliveryAmount: mapHuf(checkout.deliveryAmount, rate),
        packagingAmount: mapHuf(checkout.packagingAmount, rate),
        taxAmount: mapHuf(checkout.taxAmount, rate),
        codFeeAmount: mapHuf(checkout.codFeeAmount, rate),
        minOrderAmount:
          checkout.minOrderAmount != null ? mapHuf(checkout.minOrderAmount, rate) : null,
        belowMinPackagingFee: mapHuf(checkout.belowMinPackagingFee, rate),
        grandTotal: 0,
      }
      checkout.grandTotal = roundMoney(
        checkout.productsSubtotal +
          (checkout.deliveryIncludedInTotal ? checkout.deliveryAmount : 0) +
          checkout.packagingAmount +
          (taxAdds ? checkout.taxAmount : 0) +
          checkout.codFeeAmount,
      )
    }

    return {
      ...quote,
      totalAmount,
      subtotalBeforeDiscount,
      currency,
      fxRateUsed,
      taxRegime: tax.taxRegime,
      taxCountryCode: tax.taxCountryCode,
      taxRatePercent: tax.taxRatePercent,
      checkout,
    }
  }
}
