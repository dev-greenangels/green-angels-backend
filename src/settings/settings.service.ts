import { Injectable } from '@nestjs/common'

import { CommerceService } from '../commerce/commerce.service'
import { PrismaService } from '../prisma/prisma.service'
import {
  DEFAULT_CART_CHECKOUT_SETTINGS,
  DEFAULT_CATALOG_SETTINGS,
  DEFAULT_HOME_SETTINGS,
  DEFAULT_LOCALIZATION_SETTINGS,
  DEFAULT_MARKET_SETTINGS,
  DEFAULT_RECENTLY_VIEWED_SETTINGS,
  DEFAULT_STORE_SETTINGS,
  DEFAULT_VARIANT_LABEL_SETTINGS,
  SETTINGS_KEYS,
  type CartCheckoutSettings,
  type CatalogPageSettings,
  type HomePageSettings,
  type LocalizationSettings,
  type MarketSettings,
  type RecentlyViewedSettings,
  type StoreContactSettings,
  type VariantLabelSettings,
} from './settings.constants'
import { normalizeLocalizationSettings } from './localization.normalize'
import { normalizeRecentlyViewedSettings } from './recently-viewed.normalize'
import { normalizeCartCheckoutSettings } from './cart-checkout.normalize'
import { normalizeCatalogPageSettings } from './catalog.normalize'
import { normalizeVariantLabelSettings } from './variant-label.normalize'
import { normalizeMarketSettings, taxIncludedFromPriceBasis, isPhonePolicy } from './market.types'
import type { InventoryAuthorityMode } from './market.types'
import { DispatchCalendarService } from './dispatch-calendar.service'
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto'
import { normalizeStoreContactSettings } from './store-contact.normalize'
import { normalizeNavigationSettings } from './navigation.normalize'
import {
  DEFAULT_NAVIGATION_SETTINGS,
  type NavigationSettings,
} from './navigation.types'
import {
  DEFAULT_PRESTA_IMPORT_SETTINGS,
  normalizePrestaImportSettings,
  type PrestaImportSettings,
} from './presta-import.types'
import {
  DEFAULT_MEDIA_WATERMARK_SETTINGS,
  normalizeMediaWatermarkSettings,
  type MediaWatermarkSettings,
} from './media-watermark.types'
import { normalizeWholesalePageSettings } from './wholesale-page.normalize'
import {
  toPublicWholesalePageSettings,
  type PublicWholesalePageSettings,
  type WholesalePageCmsCopy,
  type WholesalePageSettings,
} from './wholesale-page.types'
import { normalizeAboutPageSettings } from './about-page.normalize'
import {
  type AboutPageCmsCopy,
  type AboutPageSettings,
} from './about-page.types'
import type { AppLocale } from './localization.types'

export type PublicSiteSettings = {
  store: StoreContactSettings
  home: HomePageSettings
  cart: CartCheckoutSettings
  catalog: CatalogPageSettings
  recentlyViewed: RecentlyViewedSettings
  localization: LocalizationSettings
  navigation: NavigationSettings
  market: MarketSettings
  wholesale: PublicWholesalePageSettings
  about: AboutPageSettings
  dispatchCalendar: { enabled: boolean }
}

export type BackstageSiteSettings = Omit<PublicSiteSettings, 'wholesale'> & {
  wholesale: WholesalePageSettings
  prestaImport: PrestaImportSettings
  mediaWatermark: MediaWatermarkSettings
}
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commerce: CommerceService,
    private readonly dispatchCalendar: DispatchCalendarService,
  ) {}

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

  async getStoreContactSettings(): Promise<StoreContactSettings> {
    return this.readStoreSettings()
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

  async getMarketSettings(): Promise<MarketSettings> {
    // Do not deep-merge UA-centric DEFAULT_MARKET_SETTINGS before normalize —
    // that poisons SK with priceBasis=inc_vat and checkout stops adding VAT.
    const raw = await this.readSetting(
      SETTINGS_KEYS.COMMERCE_MARKET,
      {} as MarketSettings,
    )
    const market = normalizeMarketSettings(raw)
    const defaultCurrency = await this.commerce.getDefaultCurrencyCode()
    return { ...market, defaultCurrency }
  }

  /** INV-MODE-001 / DEC-004 — does not alter checkout until later ERP batches. */
  async getInventoryAuthorityMode(): Promise<InventoryAuthorityMode> {
    const market = await this.getMarketSettings()
    return market.inventoryMode
  }

  async isLocalInventoryMode(): Promise<boolean> {
    return (await this.getInventoryAuthorityMode()) === 'local'
  }

  async isExternalInventoryMode(): Promise<boolean> {
    return (await this.getInventoryAuthorityMode()) === 'external'
  }

  async getWholesalePageSettings(): Promise<WholesalePageSettings> {
    const market = await this.getMarketSettings()
    const raw = await this.readSetting(
      SETTINGS_KEYS.WHOLESALE_PAGE,
      {} as WholesalePageSettings,
    )
    return normalizeWholesalePageSettings(raw, market.region)
  }

  async getAboutPageSettings(): Promise<AboutPageSettings> {
    const market = await this.getMarketSettings()
    const raw = await this.readSetting(SETTINGS_KEYS.ABOUT_PAGE, {} as AboutPageSettings)
    return normalizeAboutPageSettings(raw, market.region)
  }

  async getPublicSettings(): Promise<PublicSiteSettings> {
    const [store, home, cart, catalog, recentlyViewed, localization, navigation, market, dispatch] =
      await Promise.all([
        this.readStoreSettings(),
        this.readSetting(SETTINGS_KEYS.HOME_PAGE, DEFAULT_HOME_SETTINGS),
        this.getCartCheckoutSettings(),
        this.getCatalogPageSettings(),
        this.getRecentlyViewedSettings(),
        this.getLocalizationSettings(),
        this.getNavigationSettings(),
        this.getMarketSettings(),
        this.dispatchCalendar.getSettings(),
      ])
    const wholesaleRaw = await this.readSetting(
      SETTINGS_KEYS.WHOLESALE_PAGE,
      {} as WholesalePageSettings,
    )
    const aboutRaw = await this.readSetting(SETTINGS_KEYS.ABOUT_PAGE, {} as AboutPageSettings)
    return {
      store,
      home,
      cart,
      catalog,
      recentlyViewed,
      localization,
      navigation,
      market,
      wholesale: toPublicWholesalePageSettings(
        normalizeWholesalePageSettings(wholesaleRaw, market.region),
      ),
      about: normalizeAboutPageSettings(aboutRaw, market.region),
      dispatchCalendar: { enabled: dispatch.enabled },
    }
  }

  async getBackstageSettings(): Promise<BackstageSiteSettings> {
    const [publicSettings, prestaImport, mediaWatermark, wholesale] = await Promise.all([
      this.getPublicSettings(),
      this.getPrestaImportSettings(),
      this.getMediaWatermarkSettings(),
      this.getWholesalePageSettings(),
    ])
    return { ...publicSettings, wholesale, prestaImport, mediaWatermark }
  }

  async getMediaWatermarkSettings(): Promise<MediaWatermarkSettings> {
    const raw = await this.readSetting(
      SETTINGS_KEYS.MEDIA_WATERMARK,
      DEFAULT_MEDIA_WATERMARK_SETTINGS,
    )
    return normalizeMediaWatermarkSettings(raw)
  }

  async updateMediaWatermark(
    patch: Partial<MediaWatermarkSettings>,
  ): Promise<MediaWatermarkSettings> {
    const current = await this.getMediaWatermarkSettings()
    const next = normalizeMediaWatermarkSettings({ ...current, ...patch })
    return this.writeSetting(SETTINGS_KEYS.MEDIA_WATERMARK, next)
  }

  async getPrestaImportSettings(): Promise<PrestaImportSettings> {
    const raw = await this.readSetting(SETTINGS_KEYS.PRESTA_IMPORT, DEFAULT_PRESTA_IMPORT_SETTINGS)
    return normalizePrestaImportSettings(raw)
  }

  async updatePrestaImport(patch: Partial<PrestaImportSettings>): Promise<PrestaImportSettings> {
    const current = await this.getPrestaImportSettings()
    const next = normalizePrestaImportSettings({ ...current, ...patch })
    return this.writeSetting(SETTINGS_KEYS.PRESTA_IMPORT, next)
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
            title: (block.title ?? '').trim(),
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
      companyDetails: dto.companyDetails
        ? { ...current.companyDetails, ...dto.companyDetails }
        : current.companyDetails,
      showCompanyOnContacts:
        dto.showCompanyOnContacts !== undefined
          ? dto.showCompanyOnContacts
          : current.showCompanyOnContacts,
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

  async updateWholesalePage(
    patch: import('./dto/update-wholesale-page-settings.dto').UpdateWholesalePageSettingsDto,
  ): Promise<WholesalePageSettings> {
    const market = await this.getMarketSettings()
    const current = await this.getWholesalePageSettings()
    const {
      byLocale: patchByLocale,
      locale: patchLocale,
      title,
      intro,
      paragraphs,
      seoTitle,
      seoDescription,
      formTitle,
      formIntro,
      pageEnabled,
      notifyEmailEnabled,
      notifyEmail,
    } = patch

    const mergedByLocale: WholesalePageSettings['byLocale'] = {
      ...current.byLocale,
    }

    if (patchByLocale && typeof patchByLocale === 'object') {
      for (const [loc, copy] of Object.entries(patchByLocale)) {
        if (!copy || typeof copy !== 'object') continue
        mergedByLocale[loc as AppLocale] = copy as WholesalePageCmsCopy
      }
    }

    if (
      patchLocale &&
      (title !== undefined ||
        intro !== undefined ||
        paragraphs !== undefined ||
        seoTitle !== undefined ||
        seoDescription !== undefined ||
        formTitle !== undefined ||
        formIntro !== undefined)
    ) {
      const existing = mergedByLocale[patchLocale]
      mergedByLocale[patchLocale] = {
        title: title ?? existing?.title ?? '',
        intro: intro ?? existing?.intro ?? '',
        paragraphs: paragraphs ?? existing?.paragraphs ?? [],
        seoTitle: seoTitle ?? existing?.seoTitle ?? '',
        seoDescription: seoDescription ?? existing?.seoDescription ?? '',
        formTitle: formTitle ?? existing?.formTitle ?? '',
        formIntro: formIntro ?? existing?.formIntro ?? '',
      }
    }

    const next = normalizeWholesalePageSettings(
      {
        pageEnabled: pageEnabled ?? current.pageEnabled,
        notifyEmailEnabled: notifyEmailEnabled ?? current.notifyEmailEnabled,
        notifyEmail: notifyEmail === undefined ? current.notifyEmail : notifyEmail,
        byLocale: mergedByLocale,
      },
      market.region,
    )
    return this.writeSetting(SETTINGS_KEYS.WHOLESALE_PAGE, next)
  }

  async updateAboutPage(
    patch: import('./dto/update-about-page-settings.dto').UpdateAboutPageSettingsDto,
  ): Promise<AboutPageSettings> {
    const market = await this.getMarketSettings()
    const current = await this.getAboutPageSettings()
    const mergedByLocale: AboutPageSettings['byLocale'] = {
      ...current.byLocale,
    }

    if (patch.byLocale && typeof patch.byLocale === 'object') {
      for (const [loc, copy] of Object.entries(patch.byLocale)) {
        if (!copy || typeof copy !== 'object') continue
        mergedByLocale[loc as AppLocale] = copy as AboutPageCmsCopy
      }
    }

    const next = normalizeAboutPageSettings({ byLocale: mergedByLocale }, market.region)
    return this.writeSetting(SETTINGS_KEYS.ABOUT_PAGE, next)
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

  async updateMarket(patch: Partial<MarketSettings>): Promise<MarketSettings> {
    const mapped: Partial<MarketSettings> = { ...patch }
    // Legacy single knob → auth only (delivery keeps its own field / region default).
    if (mapped.authPhonePolicy === undefined && isPhonePolicy(mapped.phonePolicy)) {
      mapped.authPhonePolicy = mapped.phonePolicy
    }
    const raw = await this.readSetting(
      SETTINGS_KEYS.COMMERCE_MARKET,
      {} as MarketSettings,
    )
    const next = normalizeMarketSettings({ ...normalizeMarketSettings(raw), ...mapped })

    // Single source of truth for catalog/orders currency lives in commerce.defaults.
    await this.commerce.updateDefaults({ defaultCurrencyCode: next.defaultCurrency })

    await this.writeSetting(SETTINGS_KEYS.COMMERCE_MARKET, next)

    // Keep cart.checkout.taxIncluded aligned for any consumers still reading the flag.
    const cart = await this.getCartCheckoutSettings()
    const taxIncluded = taxIncludedFromPriceBasis(next.priceBasis)
    if (cart.taxIncluded !== taxIncluded) {
      await this.writeSetting(SETTINGS_KEYS.CART_CHECKOUT, { ...cart, taxIncluded })
    }

    return this.getMarketSettings()
  }
}
