import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { CountrySiteCode, MarketSettings } from '../settings/market.types'
import type { StoreContactSettings } from '../settings/settings.constants'
import { SettingsService } from '../settings/settings.service'
import {
  canonicalHostForCountryCode,
  hostnameFromUrl,
  parseCountryHostMap,
} from './country-hosts'
import { buildMailIdentity } from './mail-identity.rules'

export type MailIdentityKind = 'otp' | 'order' | 'stock' | 'wholesale'

export type ResolveMailIdentityInput = {
  kind: MailIdentityKind
  /** SK host site; null/omitted on UA */
  countrySiteCode?: CountrySiteCode | null
  /** Wholesale only: customer inquiry email */
  replyToOverride?: string | null
}

export type MailIdentity = {
  from: string
  replyTo: string | null
  domain: string
  countrySiteCode: CountrySiteCode | null
}

const SUPPORT_LABEL_HINTS = ['підтримка', 'support', 'kontakt', 'contact']

function pickStoreSupportEmail(store: StoreContactSettings): string | null {
  const emails = store.emails.filter((item) => item.email.trim())
  if (emails.length === 0) {
    for (const block of store.contactBlocks) {
      for (const line of block.lines) {
        if (line.type !== 'email' || !line.value.trim()) continue
        const hay = `${block.title} ${line.label ?? ''}`.toLowerCase()
        if (SUPPORT_LABEL_HINTS.some((h) => hay.includes(h))) {
          return line.value.trim()
        }
      }
    }
    for (const block of store.contactBlocks) {
      const emailLine = block.lines.find((l) => l.type === 'email' && l.value.trim())
      if (emailLine) return emailLine.value.trim()
    }
    return null
  }

  const byLabel = emails.find((item) =>
    SUPPORT_LABEL_HINTS.some((h) => item.label.trim().toLowerCase().includes(h)),
  )
  return (byLabel ?? emails[0])?.email.trim() || null
}

function normalizeCountrySiteCode(raw: string | null | undefined): CountrySiteCode | null {
  const code = (raw ?? '').trim().toLowerCase()
  if (code === 'sk' || code === 'hu' || code === 'at') return code
  return null
}

@Injectable()
export class MailIdentityService {
  private readonly logger = new Logger(MailIdentityService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  async resolve(input: ResolveMailIdentityInput): Promise<MailIdentity | null> {
    const market = await this.settings.getMarketSettings()
    const store = await this.settings.getStoreContactSettings()
    const countrySiteCode = normalizeCountrySiteCode(input.countrySiteCode)

    const domain = this.resolveMailDomain(market, countrySiteCode)
    if (!domain) {
      this.logger.warn('Mail identity: не вдалося визначити домен відправника')
      return null
    }

    const support = this.resolveSupportEmail(market, store, countrySiteCode)
    const localPart =
      this.config.get<string>('MAIL_FROM_LOCAL_PART')?.trim() || 'noreply'

    const identity = buildMailIdentity({
      kind: input.kind,
      domain,
      supportEmail: support,
      countrySiteCode,
      localPart,
      replyToOverride: input.replyToOverride,
      marketRegion: market.region,
    })
    if (!identity) {
      this.logger.warn(
        `Mail identity: не вдалося зібрати From/Reply-To (kind=${input.kind}, domain=${domain})`,
      )
    }
    return identity
  }

  private resolveSupportEmail(
    market: MarketSettings,
    store: StoreContactSettings,
    countrySiteCode: CountrySiteCode | null,
  ): string | null {
    if (market.region === 'sk' && countrySiteCode) {
      const site = market.countrySites.find((s) => s.code === countrySiteCode && s.enabled)
      const fromSite = site?.supportEmail?.trim() || null
      if (fromSite) return fromSite
    }
    return pickStoreSupportEmail(store)
  }

  private resolveMailDomain(
    market: MarketSettings,
    countrySiteCode: CountrySiteCode | null,
  ): string | null {
    const hostMap = parseCountryHostMap(this.config.get<string>('GA_COUNTRY_HOSTS'))

    if (market.region === 'sk') {
      const code = countrySiteCode ?? (hostMap.size > 0 ? ('sk' as const) : null)
      if (!code) return this.resolveUaStyleDomain()
      const host = canonicalHostForCountryCode(code, hostMap)
      if (host) return host
      this.logger.warn(`Mail identity: немає хоста в GA_COUNTRY_HOSTS для ${code}`)
      return null
    }

    return this.resolveUaStyleDomain()
  }

  /** UA (or missing map): MAIL_DOMAIN → SHOP_PUBLIC_URL host. */
  private resolveUaStyleDomain(): string | null {
    const mailDomain = this.config.get<string>('MAIL_DOMAIN')?.trim().toLowerCase()
    if (mailDomain) return normalizeBareDomain(mailDomain)

    const fromShop = hostnameFromUrl(this.config.get<string>('SHOP_PUBLIC_URL'))
    if (fromShop) {
      return fromShop.startsWith('www.') ? fromShop.slice(4) : fromShop
    }
    return null
  }
}

function normalizeBareDomain(raw: string): string {
  const host = hostnameFromUrl(raw.includes('://') ? raw : `https://${raw}`)
  return host.startsWith('www.') ? host.slice(4) : host
}
