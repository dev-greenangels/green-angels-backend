import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import type { Request, Response } from 'express'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard'
import { SettingsService } from '../settings/settings.service'
import { computeCheckoutTotals } from './checkout-totals'
import { QuotePricingDto } from './dto/quote-pricing.dto'
import { ShelfPricesDto } from './dto/shelf-prices.dto'
import { PricingService } from './pricing.service'
import { pickCartCnCode, resolveCheckoutTax } from './tax-regime'
import { applyHufPresentmentToCheckout } from './apply-huf-presentment'
import { hufLineTotalFromEurUnit, resolveCountrySiteCurrency } from './resolve-country-site-currency'

@Controller('pricing')
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Private shelf batch for authenticated WHOLESALER catalog overlay.
   * Commercial ladder (DiscountRule × Sales Prices dual-offer). Never accept audience from body.
   * Cache-Control: private, no-store — must not enter shared CDN/RSC cache.
   */
  @Post('shelf-prices')
  @UseGuards(OptionalJwtAuthGuard)
  async shelfPrices(
    @Body() dto: ShelfPricesDto,
    @Req() req: Request & { user?: SessionJwtPayload },
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate')
    res.setHeader('Vary', 'Cookie')
    const audience = await this.pricing.resolveAudience({
      userId: req.user?.userId,
    })
    const items = await this.pricing.shelfUnitPrices({
      variantIds: dto.variantIds,
      audience,
    })
    return {
      items,
      // Any authenticated session may receive a private commercial ladder (retail or wholesale).
      personalized: Boolean(audience.userId),
      wholesale: audience.role === Role.WHOLESALER,
    }
  }

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
      // Preview only: client viesValid can affect quote display, but
      // isIntraEuB2bGoodsEligible still requires EU delivery ≠ SK, so a forged
      // viesValid cannot unlock intra-EU 0% for SK/CH/GB/UA ship-to.
      // Order create re-validates VIES server-side and ignores client viesValid.
      viesValid: dto.viesValid,
      fallbackTaxRatePercent: cartSettings.taxRatePercent,
      fallbackTaxIncluded: cartSettings.taxIncluded,
    })

    // Customer deliveryAmount uses method:CC → method only (no Packeta fulfilment identity).
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
      containerQtyBySlug: quote.containerQtyBySlug,
      audienceRole: audience.role,
      deliveryCountryCode: dto.deliveryCountryCode,
      hostCountryCode: dto.countryCode,
      productLines: quote.lines.map((line) => ({
        unitGross: line.unitPrice,
        quantity: line.quantity,
      })),
      taxOverride: tax,
      pendingShippingPromos: quote.pendingShippingPromos,
      promoFixedProductDiscountAmount: quote.promoFixedProductDiscountAmount,
    })

    // Presentment currency = countrySites (HU), never deploy defaultCurrency alone.
    const resolved = resolveCountrySiteCurrency(market, dto.countryCode)
    let currency = resolved.currency
    let fxRateUsed: number | null = null
    let totalAmount = quote.totalAmount
    let subtotalBeforeDiscount = quote.subtotalBeforeDiscount
    let lines = quote.lines

    if (resolved.applyHufFx) {
      const rate = resolved.eurToHufRate
      fxRateUsed = rate
      currency = 'HUF'
      lines = quote.lines.map((line) => {
        const { unitHuf, lineHuf } = hufLineTotalFromEurUnit(
          line.unitPrice,
          line.quantity,
          rate,
        )
        return { ...line, unitPrice: unitHuf, lineTotal: lineHuf }
      })
      totalAmount = lines.reduce((sum, line) => sum + line.lineTotal, 0)
      subtotalBeforeDiscount = quote.lines.reduce((sum, line) => {
        const base = line.baseUnitPrice ?? line.unitPrice
        return sum + hufLineTotalFromEurUnit(base, line.quantity, rate).lineHuf
      }, 0)
      checkout = applyHufPresentmentToCheckout(
        checkout,
        quote.lines.map((line) => ({
          unitPriceEur: line.unitPrice,
          quantity: line.quantity,
        })),
        rate,
      )
    }

    return {
      ...quote,
      lines,
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
