import { Injectable } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import {
  DEFAULT_CART_CHECKOUT_SETTINGS,
  DEFAULT_CATALOG_SETTINGS,
  DEFAULT_HOME_SETTINGS,
  DEFAULT_STORE_SETTINGS,
  SETTINGS_KEYS,
  type CartCheckoutSettings,
  type CatalogPageSettings,
  type HomePageSettings,
  type StoreContactSettings,
} from './settings.constants'
import { normalizeCartCheckoutSettings } from './cart-checkout.normalize'
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto'
import { normalizeStoreContactSettings } from './store-contact.normalize'

export type PublicSiteSettings = {
  store: StoreContactSettings
  home: HomePageSettings
  cart: CartCheckoutSettings
  catalog: CatalogPageSettings
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
    return this.readSetting(SETTINGS_KEYS.CATALOG_PAGE, DEFAULT_CATALOG_SETTINGS)
  }

  async getPublicSettings(): Promise<PublicSiteSettings> {
    const [store, home, cart, catalog] = await Promise.all([
      this.readStoreSettings(),
      this.readSetting(SETTINGS_KEYS.HOME_PAGE, DEFAULT_HOME_SETTINGS),
      this.getCartCheckoutSettings(),
      this.getCatalogPageSettings(),
    ])
    return { store, home, cart, catalog }
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
    const normalized: CatalogPageSettings = {
      categoryDisplay: next.categoryDisplay ?? DEFAULT_CATALOG_SETTINGS.categoryDisplay,
      visibleCategoryIds: Array.isArray(next.visibleCategoryIds)
        ? [
            ...new Set(
              next.visibleCategoryIds.filter(
                (id): id is string => typeof id === 'string' && id.trim() !== '',
              ),
            ),
          ]
        : DEFAULT_CATALOG_SETTINGS.visibleCategoryIds,
    }
    return this.writeSetting(SETTINGS_KEYS.CATALOG_PAGE, normalized)
  }
}
