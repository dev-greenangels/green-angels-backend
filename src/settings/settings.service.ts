import { Injectable } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import {
  DEFAULT_CART_CHECKOUT_SETTINGS,
  DEFAULT_CATALOG_SETTINGS,
  DEFAULT_HOME_SETTINGS,
  DEFAULT_LOCALIZATION_SETTINGS,
  DEFAULT_RECENTLY_VIEWED_SETTINGS,
  DEFAULT_STORE_SETTINGS,
  DEFAULT_VARIANT_LABEL_SETTINGS,
  SETTINGS_KEYS,
  type CartCheckoutSettings,
  type CatalogPageSettings,
  type HomePageSettings,
  type LocalizationSettings,
  type RecentlyViewedSettings,
  type StoreContactSettings,
  type VariantLabelSettings,
} from './settings.constants'
import { normalizeLocalizationSettings } from './localization.normalize'
import { normalizeRecentlyViewedSettings } from './recently-viewed.normalize'
import { normalizeCartCheckoutSettings } from './cart-checkout.normalize'
import { normalizeCatalogPageSettings } from './catalog.normalize'
import { normalizeVariantLabelSettings } from './variant-label.normalize'
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto'
import { normalizeStoreContactSettings } from './store-contact.normalize'
import { normalizeNavigationSettings } from './navigation.normalize'
import {
  DEFAULT_NAVIGATION_SETTINGS,
  type NavigationSettings,
} from './navigation.types'

export type PublicSiteSettings = {
  store: StoreContactSettings
  home: HomePageSettings
  cart: CartCheckoutSettings
  catalog: CatalogPageSettings
  recentlyViewed: RecentlyViewedSettings
  localization: LocalizationSettings
  navigation: NavigationSettings
}

export type BackstageSiteSettings = PublicSiteSettings

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseJson<T extends Record<string, unknown>>(raw: string | null | undefined, fallback: T): T {
    if (!raw?.trim()) return fallback
    try {
      return this.deepMerge(fallback, JSON.parse(raw) as Partial<T>)
    } catch {
      return fallback
    }
  }

  private deepMerge<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
    const result = { ...base }
    for (const key of Object.keys(patch) as Array<keyof T>) {
      const value = patch[key]
      if (value === undefined) continue
      const current = base[key]
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        current &&
        typeof current === 'object' &&
        !Array.isArray(current)
      ) {
        result[key] = this.deepMerge(
          current as Record<string, unknown>,
          value as Record<string, unknown>,
        ) as T[keyof T]
      } else {
        result[key] = value as T[keyof T]
      }
    }
    return result
  }

  private async readSetting<T>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.settings.findUnique({ where: { key } })
    return this.parseJson(
      row?.value,
      fallback as Record<string, unknown>,
    ) as T
  }

  private async writeSetting<T extends Record<string, unknown>>(
    key: string,
    value: T,
  ): Promise<T> {
    const payload = JSON.stringify(value)
    await this.prisma.settings.upsert({
      where: { key },
      create: { key, value: payload },
      update: { value: payload },
    })
    return value
  }

  private async readStoreSettings(): Promise<StoreContactSettings> {
    const raw = await this.readSetting(SETTINGS_KEYS.STORE, DEFAULT_STORE_SETTINGS)
    return normalizeStoreContactSettings(raw)
  }

  async getCartCheckoutSettings(): Promise<CartCheckoutSettings> {
    const raw = await this.readSetting(SETTINGS_KEYS.CART_CHECKOUT, DEFAULT_CART_CHECKOUT_SETTINGS)
    return normalizeCartCheckoutSettings(raw)
  }

  async getCatalogPageSettings(): Promise<CatalogPageSettings> {
    const raw = await this.readSetting(SETTINGS_KEYS.CATALOG_PAGE, DEFAULT_CATALOG_SETTINGS)
    return normalizeCatalogPageSettings(raw)
  }

  async getRecentlyViewedSettings(): Promise<RecentlyViewedSettings> {
    const raw = await this.readSetting(SETTINGS_KEYS.RECENTLY_VIEWED, DEFAULT_RECENTLY_VIEWED_SETTINGS)
    return normalizeRecentlyViewedSettings(raw)
  }

  async getLocalizationSettings(): Promise<LocalizationSettings> {
    const raw = await this.readSetting(SETTINGS_KEYS.LOCALIZATION, DEFAULT_LOCALIZATION_SETTINGS)
    return normalizeLocalizationSettings(raw)
  }

  async getVariantLabelSettings(): Promise<VariantLabelSettings> {
    const raw = await this.readSetting(SETTINGS_KEYS.VARIANT_LABELS, DEFAULT_VARIANT_LABEL_SETTINGS)
    return normalizeVariantLabelSettings(raw)
  }

  async getNavigationSettings(): Promise<NavigationSettings> {
    const raw = await this.readSetting(SETTINGS_KEYS.NAVIGATION, DEFAULT_NAVIGATION_SETTINGS)
    return normalizeNavigationSettings(raw)
  }

  async getPublicSettings(): Promise<PublicSiteSettings> {
    const [store, home, cart, catalog, recentlyViewed, localization, navigation] = await Promise.all([
      this.readStoreSettings(),
      this.readSetting(SETTINGS_KEYS.HOME_PAGE, DEFAULT_HOME_SETTINGS),
      this.getCartCheckoutSettings(),
      this.getCatalogPageSettings(),
      this.getRecentlyViewedSettings(),
      this.getLocalizationSettings(),
      this.getNavigationSettings(),
    ])
    return { store, home, cart, catalog, recentlyViewed, localization, navigation }
  }

  async getBackstageSettings(): Promise<BackstageSiteSettings> {
    return this.getPublicSettings()
  }

  async updateStore(dto: UpdateStoreSettingsDto): Promise<StoreContactSettings> {
    const current = await this.readStoreSettings()
    const next = normalizeStoreContactSettings({
      ...current,
      addressLine1: dto.addressLine1 ?? current.addressLine1,
      addressLine2: dto.addressLine2 ?? current.addressLine2,
      mapsUrl: dto.mapsUrl ?? current.mapsUrl,
      mapsEmbedUrl: dto.mapsEmbedUrl ?? current.mapsEmbedUrl,
      contactBlocks: dto.contactBlocks
        ? dto.contactBlocks.map((block) => ({
            title: block.title,
            lines: block.lines.map((line) => ({
              type: line.type,
              label: line.label,
              value: line.value ?? '',
            })),
          }))
        : current.contactBlocks,
      phones: dto.phones ?? current.phones,
      emails: dto.emails ?? current.emails,
      schedules: dto.schedules ?? current.schedules,
      footer: dto.footer ? { ...current.footer, ...dto.footer } : current.footer,
      social: dto.social
        ? {
            instagram: { ...current.social.instagram, ...dto.social.instagram },
            facebook: { ...current.social.facebook, ...dto.social.facebook },
            youtube: { ...current.social.youtube, ...dto.social.youtube },
            viberCommunity: { ...current.social.viberCommunity, ...dto.social.viberCommunity },
            telegramCommunity: {
              ...current.social.telegramCommunity,
              ...dto.social.telegramCommunity,
            },
          }
        : current.social,
    })
    return this.writeSetting(SETTINGS_KEYS.STORE, next)
  }

  async updateHomePage(patch: Partial<HomePageSettings>): Promise<HomePageSettings> {
    const current = await this.readSetting(SETTINGS_KEYS.HOME_PAGE, DEFAULT_HOME_SETTINGS)
    const next = this.deepMerge(
      current as unknown as Record<string, unknown>,
      patch as unknown as Record<string, unknown>,
    ) as HomePageSettings
    return this.writeSetting(SETTINGS_KEYS.HOME_PAGE, next)
  }

  async updateCartCheckout(patch: Partial<CartCheckoutSettings>): Promise<CartCheckoutSettings> {
    const current = await this.getCartCheckoutSettings()
    const next = normalizeCartCheckoutSettings(
      this.deepMerge(
        current as unknown as Record<string, unknown>,
        patch as unknown as Record<string, unknown>,
      ) as CartCheckoutSettings,
    )
    return this.writeSetting(SETTINGS_KEYS.CART_CHECKOUT, next)
  }

  async updateCatalogPage(patch: Partial<CatalogPageSettings>): Promise<CatalogPageSettings> {
    const current = await this.getCatalogPageSettings()
    const next = this.deepMerge(
      current as unknown as Record<string, unknown>,
      patch as unknown as Record<string, unknown>,
    ) as CatalogPageSettings
    const normalized = normalizeCatalogPageSettings(next)
    return this.writeSetting(SETTINGS_KEYS.CATALOG_PAGE, normalized)
  }

  async updateRecentlyViewed(patch: Partial<RecentlyViewedSettings>): Promise<RecentlyViewedSettings> {
    const current = await this.getRecentlyViewedSettings()
    const merged = this.deepMerge(
      current as unknown as Record<string, unknown>,
      patch as unknown as Record<string, unknown>,
    ) as RecentlyViewedSettings
    const next = normalizeRecentlyViewedSettings(merged)
    return this.writeSetting(SETTINGS_KEYS.RECENTLY_VIEWED, next)
  }

  async updateLocalization(patch: Partial<LocalizationSettings>): Promise<LocalizationSettings> {
    const current = await this.getLocalizationSettings()
    const merged = this.deepMerge(
      current as unknown as Record<string, unknown>,
      patch as unknown as Record<string, unknown>,
    ) as LocalizationSettings
    const next = normalizeLocalizationSettings(merged)
    return this.writeSetting(SETTINGS_KEYS.LOCALIZATION, next)
  }

  async updateVariantLabelSettings(
    patch: Partial<VariantLabelSettings>,
  ): Promise<VariantLabelSettings> {
    const current = await this.getVariantLabelSettings()
    const next = normalizeVariantLabelSettings({
      ...current,
      ...patch,
      labelTypeOrder: patch.labelTypeOrder ?? current.labelTypeOrder,
    })
    return this.writeSetting(SETTINGS_KEYS.VARIANT_LABELS, next)
  }

  async updateNavigation(patch: Partial<NavigationSettings>): Promise<NavigationSettings> {
    const current = await this.getNavigationSettings()
    const next = normalizeNavigationSettings({
      ...current,
      ...patch,
      items: patch.items ?? current.items,
    })
    return this.writeSetting(SETTINGS_KEYS.NAVIGATION, next)
  }
}
