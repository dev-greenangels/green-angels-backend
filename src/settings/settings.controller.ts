import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import type {
  CartCheckoutSettings,
  CatalogPageSettings,
  HomePageSettings,
  LocalizationSettings,
  MarketSettings,
  RecentlyViewedSettings,
} from './settings.constants'
import { UpdateCartCheckoutSettingsDto } from './dto/update-cart-checkout-settings.dto'
import { UpdateLocalizationSettingsDto } from './dto/update-localization-settings.dto'
import { UpdateMarketSettingsDto } from './dto/update-market-settings.dto'
import { UpdateVariantLabelSettingsDto } from './dto/update-variant-label-settings.dto'
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto'
import { UpdatePrestaImportSettingsDto } from './dto/update-presta-import-settings.dto'
import { UpdateMediaWatermarkSettingsDto } from './dto/update-media-watermark-settings.dto'
import { UpdateWholesalePageSettingsDto } from './dto/update-wholesale-page-settings.dto'
import { SettingsService } from './settings.service'
import type { VariantLabelSettings } from './settings.constants'
import type { NavigationSettings } from './navigation.types'
import { DispatchCalendarService } from './dispatch-calendar.service'
import type { DispatchCalendarSettings } from './dispatch-calendar.types'

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly dispatchCalendar: DispatchCalendarService,
  ) {}

  @Get('public')
  getPublic() {
    return this.settings.getPublicSettings()
  }

  @Post('dispatch-calendar/available-dates')
  async availableDispatchDates(
    @Body() body: { availableFromDates?: string[]; earliest?: string },
  ) {
    const settings = await this.dispatchCalendar.getSettings()
    if (!settings.enabled) {
      return { enabled: false, dates: [] as Array<{ date: string; remaining: number | null }> }
    }
    const dates = await this.dispatchCalendar.listAvailableDates({
      earliest: body?.earliest,
      availableFromDates: body?.availableFromDates,
    })
    return { enabled: true, dates }
  }

  @Get('dispatch-calendar')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  async getDispatchCalendar() {
    const [settings, report] = await Promise.all([
      this.dispatchCalendar.getSettings(),
      this.dispatchCalendar.getCapacityReport(),
    ])
    return { settings, report }
  }

  @Patch('dispatch-calendar')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateDispatchCalendar(@Body() dto: Partial<DispatchCalendarSettings>) {
    return this.dispatchCalendar.updateSettings(dto)
  }

  @Get()
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getBackstage() {
    return this.settings.getBackstageSettings()
  }

  @Patch('store')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateStore(@Body() dto: UpdateStoreSettingsDto) {
    return this.settings.updateStore(dto)
  }

  @Patch('home')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateHome(@Body() dto: Partial<HomePageSettings>) {
    return this.settings.updateHomePage(dto)
  }

  @Patch('wholesale')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateWholesale(@Body() dto: UpdateWholesalePageSettingsDto) {
    return this.settings.updateWholesalePage(dto)
  }

  @Patch('cart-checkout')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateCartCheckout(@Body() dto: UpdateCartCheckoutSettingsDto) {
    return this.settings.updateCartCheckout(dto as Partial<CartCheckoutSettings>)
  }

  @Patch('catalog')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateCatalog(@Body() dto: Partial<CatalogPageSettings>) {
    return this.settings.updateCatalogPage(dto)
  }

  @Patch('recently-viewed')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateRecentlyViewed(@Body() dto: Partial<RecentlyViewedSettings>) {
    return this.settings.updateRecentlyViewed(dto)
  }

  @Patch('localization')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateLocalization(@Body() dto: UpdateLocalizationSettingsDto) {
    return this.settings.updateLocalization(dto as Partial<LocalizationSettings>)
  }

  @Get('variant-labels')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getVariantLabels() {
    return this.settings.getVariantLabelSettings()
  }

  @Patch('variant-labels')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateVariantLabels(@Body() dto: UpdateVariantLabelSettingsDto) {
    return this.settings.updateVariantLabelSettings(dto as Partial<VariantLabelSettings>)
  }

  @Patch('navigation')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateNavigation(@Body() dto: Partial<NavigationSettings>) {
    return this.settings.updateNavigation(dto)
  }

  @Patch('presta-import')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updatePrestaImport(@Body() dto: UpdatePrestaImportSettingsDto) {
    return this.settings.updatePrestaImport(dto)
  }

  @Patch('media-watermark')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateMediaWatermark(@Body() dto: UpdateMediaWatermarkSettingsDto) {
    return this.settings.updateMediaWatermark(dto)
  }

  @Patch('market')
  @UseGuards(BackstageJwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateMarket(@Body() dto: UpdateMarketSettingsDto) {
    return this.settings.updateMarket(dto as Partial<MarketSettings>)
  }
}
