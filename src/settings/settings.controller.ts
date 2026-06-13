import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'

import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { CartCheckoutSettings, CatalogPageSettings, HomePageSettings } from './settings.constants'
import { UpdateCartCheckoutSettingsDto } from './dto/update-cart-checkout-settings.dto'
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto'
import { SettingsService } from './settings.service'

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('public')
  getPublic() {
    return this.settings.getPublicSettings()
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  getBackstage() {
    return this.settings.getBackstageSettings()
  }

  @Patch('store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateStore(@Body() dto: UpdateStoreSettingsDto) {
    return this.settings.updateStore(dto)
  }

  @Patch('home')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateHome(@Body() dto: Partial<HomePageSettings>) {
    return this.settings.updateHomePage(dto)
  }

  @Patch('cart-checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateCartCheckout(@Body() dto: UpdateCartCheckoutSettingsDto) {
    return this.settings.updateCartCheckout(dto as Partial<CartCheckoutSettings>)
  }

  @Patch('catalog')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.MANAGER)
  updateCatalog(@Body() dto: Partial<CatalogPageSettings>) {
    return this.settings.updateCatalogPage(dto)
  }
}
