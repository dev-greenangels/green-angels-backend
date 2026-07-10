import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { BackstageJwtAuthGuard } from '../auth/backstage-jwt-auth.guard'
import type {
  CartCheckoutSettings,
  CatalogPageSettings,
  HomePageSettings,
  LocalizationSettings,
  RecentlyViewedSettings,
} from './settings.constants'
import { UpdateCartCheckoutSettingsDto } from './dto/update-cart-checkout-settings.dto'
import { UpdateLocalizationSettingsDto } from './dto/update-localization-settings.dto'
import { UpdateVariantLabelSettingsDto } from './dto/update-variant-label-settings.dto'
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto'
import { SettingsService } from './settings.service'
import type { VariantLabelSettings } from './settings.constants'
import type { NavigationSettings } from './navigation.types'

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('public')
  getPublic() {
    return this.settings.getPublicSettings()
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
}
