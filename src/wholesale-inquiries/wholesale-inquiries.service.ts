import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { createHash } from 'crypto'
import { WholesaleInquiryStatus } from '@prisma/client'

import { resolveOtpRateLimitPeerIp } from '../auth/otp.service'
import { validatePhoneForPolicy } from '../auth/market-phone.util'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import type { MarketRegion, PhonePolicy } from '../settings/market.types'
import type { StoreContactSettings } from '../settings/settings.constants'
import { SettingsService } from '../settings/settings.service'
import { CreateWholesaleInquiryDto } from './dto/create-wholesale-inquiry.dto'
import { WholesaleInquiryQueryDto } from './dto/wholesale-inquiry-query.dto'

const EMAIL_RATE_MAX = 3
const PHONE_RATE_MAX = 3
const IP_RATE_MAX = 5
const RATE_WINDOW_SEC = 3600
const MIN_FILL_MS = 2500
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const SUPPORTED_LOCALES = new Set(['uk', 'en', 'sk', 'hu', 'de', 'cs'])

export type WholesaleInquiryListItem = {
  id: string
  status: WholesaleInquiryStatus
  locale: string
  marketRegion: string
  fullName: string
  companyName: string
  phone: string
  email: string
  city: string
  website: string | null
  message: string | null
  companyIco: string | null
  companyVatId: string | null
  consentAt: string | null
  createdAt: string
}

@Injectable()
export class WholesaleInquiriesService {
  private readonly logger = new Logger(WholesaleInquiriesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
  ) {}

  resolveClientIp(input: {
    remoteAddress?: string
    forwardedClientIp?: string
  }): string | undefined {
    const peer = resolveOtpRateLimitPeerIp(input.remoteAddress)
    if (peer) return peer
    const forwarded = input.forwardedClientIp?.trim()
    if (!forwarded) return undefined
    return resolveOtpRateLimitPeerIp(forwarded) ?? this.sanitizeForwardedIp(forwarded)
  }

  private sanitizeForwardedIp(raw: string): string | undefined {
    const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw.trim()
    if (!ip || ip.length > 45) return undefined
    if (/[\s,;]/.test(ip)) return undefined
    return ip
  }

  private hashIp(ip: string): string {
    return createHash('sha256').update(ip).digest('hex').slice(0, 32)
  }

  private normalizeLocale(raw: string | undefined): string {
    const locale = raw?.trim().toLowerCase() ?? ''
    return SUPPORTED_LOCALES.has(locale) ? locale : 'uk'
  }

  private stripTags(value: string): string {
    return value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  }

  private normalizeWebsite(raw: string | undefined): string | null {
    const trimmed = raw?.trim() ?? ''
    if (!trimmed) return null
    if (/^(javascript|data|vbscript):/i.test(trimmed)) {
      throw new BadRequestException('Некоректне посилання.')
    }
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    try {
      const url = new URL(withProto)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new BadRequestException('Некоректне посилання.')
      }
      if (!url.hostname.includes('.')) {
        throw new BadRequestException('Некоректне посилання.')
      }
      return url.toString().slice(0, 300)
    } catch (err) {
      if (err instanceof BadRequestException) throw err
      throw new BadRequestException('Некоректне посилання.')
    }
  }

  private normalizeIco(raw: string | undefined, required: boolean): string | null {
    const digits = (raw ?? '').replace(/\D/g, '')
    if (!digits) {
      if (required) throw new BadRequestException('Вкажіть IČO фірми.')
      return null
    }
    if (digits.length < 6 || digits.length > 12) {
      throw new BadRequestException('Некоректне IČO.')
    }
    return digits
  }

  private normalizeVatId(raw: string | undefined): string | null {
    const compact = (raw ?? '').replace(/\s+/g, '').toUpperCase()
    if (!compact) return null
    if (!/^[A-Z]{0,2}\d{6,12}$/.test(compact)) {
      throw new BadRequestException('Некоректне IČ DPH / VAT ID.')
    }
    return compact.slice(0, 32)
  }

  private pickNotifyEmail(store: StoreContactSettings): string | null {
    const labels = ['гурт', 'опт', 'wholesale', 'velkoobchod', 'b2b']
    const fromBlocks = store.contactBlocks.flatMap((block) =>
      block.lines
        .filter((line) => line.type === 'email' && line.value.trim())
        .map((line) => ({
          label: `${block.title} ${line.label ?? ''}`.toLowerCase(),
          email: line.value.trim(),
        })),
    )
    const labeled = fromBlocks.find((row) => labels.some((label) => row.label.includes(label)))
    if (labeled?.email) return labeled.email
    const first = fromBlocks[0]?.email
    if (first) return first
    const emails = store.emails.filter((row) => row.email.trim())
    const byLabel = emails.find((row) => labels.includes(row.label.trim().toLowerCase()))
    return byLabel?.email.trim() || emails[0]?.email.trim() || null
  }

  private async hitRateLimit(key: string, max: number): Promise<boolean> {
    const count = await this.redis.client.incr(key)
    if (count === 1) {
      await this.redis.client.expire(key, RATE_WINDOW_SEC)
    }
    return count > max
  }

  private silentOk() {
    return { ok: true as const }
  }

  async create(
    dto: CreateWholesaleInquiryDto,
    clientIp: string | undefined,
  ): Promise<{ ok: true }> {
    if (dto.fax?.trim()) {
      return this.silentOk()
    }
    if (typeof dto.startedAt === 'number') {
      const elapsed = Date.now() - dto.startedAt
      if (elapsed >= 0 && elapsed < MIN_FILL_MS) {
        return this.silentOk()
      }
    }

    const market = await this.settings.getMarketSettings()
    const region: MarketRegion = market.region === 'sk' ? 'sk' : 'ua'
    const phonePolicy: PhonePolicy = market.authPhonePolicy
    const phone = validatePhoneForPolicy(dto.phone, phonePolicy)
    if (!phone) {
      throw new BadRequestException('Вкажіть коректний номер телефону.')
    }

    const email = dto.email.trim().toLowerCase()
    const fullName = this.stripTags(dto.fullName)
    const companyName = this.stripTags(dto.companyName)
    const city = this.stripTags(dto.city)
    const message = dto.message?.trim() ? this.stripTags(dto.message).slice(0, 2000) : null
    const website = this.normalizeWebsite(dto.website)
    const companyIco = this.normalizeIco(dto.companyIco, region === 'sk')
    const companyVatId = this.normalizeVatId(dto.companyVatId)

    if (region === 'sk' && dto.consent !== true) {
      throw new BadRequestException('Потрібна згода на обробку персональних даних.')
    }

    const emailKey = `wholesale:rl:email:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`
    const phoneKey = `wholesale:rl:phone:${phone}`
    if (await this.hitRateLimit(emailKey, EMAIL_RATE_MAX)) {
      throw new HttpException('Забагато заявок. Спробуйте пізніше.', HttpStatus.TOO_MANY_REQUESTS)
    }
    if (await this.hitRateLimit(phoneKey, PHONE_RATE_MAX)) {
      throw new HttpException('Забагато заявок. Спробуйте пізніше.', HttpStatus.TOO_MANY_REQUESTS)
    }
    if (clientIp) {
      const ipKey = `wholesale:rl:ip:${this.hashIp(clientIp)}`
      if (await this.hitRateLimit(ipKey, IP_RATE_MAX)) {
        throw new HttpException('Забагато заявок. Спробуйте пізніше.', HttpStatus.TOO_MANY_REQUESTS)
      }
    }

    const locale = this.normalizeLocale(dto.locale)
    const created = await this.prisma.wholesaleInquiry.create({
      data: {
        locale,
        marketRegion: region,
        fullName,
        companyName,
        phone,
        email,
        city,
        website,
        message,
        companyIco,
        companyVatId,
        consentAt: region === 'sk' ? new Date() : null,
        ipHash: clientIp ? this.hashIp(clientIp) : null,
      },
    })

    const store = await this.settings.getStoreContactSettings()
    const notifyTo = this.pickNotifyEmail(store)
    try {
      await this.mail.sendWholesaleInquiryEmail({
        to: notifyTo,
        region,
        inquiry: {
          fullName,
          companyName,
          phone,
          email,
          city,
          website,
          message,
          companyIco,
          companyVatId,
          locale,
        },
      })
    } catch (err) {
      this.logger.warn(
        `Не вдалося надіслати лист про заявку ${created.id}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      )
    }

    return { ok: true }
  }

  private toListItem(row: {
    id: string
    status: WholesaleInquiryStatus
    locale: string
    marketRegion: string
    fullName: string
    companyName: string
    phone: string
    email: string
    city: string
    website: string | null
    message: string | null
    companyIco: string | null
    companyVatId: string | null
    consentAt: Date | null
    createdAt: Date
  }): WholesaleInquiryListItem {
    return {
      id: row.id,
      status: row.status,
      locale: row.locale,
      marketRegion: row.marketRegion,
      fullName: row.fullName,
      companyName: row.companyName,
      phone: row.phone,
      email: row.email,
      city: row.city,
      website: row.website,
      message: row.message,
      companyIco: row.companyIco,
      companyVatId: row.companyVatId,
      consentAt: row.consentAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }
  }

  async findAllBackstage(query: WholesaleInquiryQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const where = query.status ? { status: query.status } : {}

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.wholesaleInquiry.count({ where }),
      this.prisma.wholesaleInquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return {
      items: rows.map((row) => this.toListItem(row)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  }

  async updateStatus(id: string, status: WholesaleInquiryStatus) {
    const existing = await this.prisma.wholesaleInquiry.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Заявку не знайдено.')
    const updated = await this.prisma.wholesaleInquiry.update({
      where: { id },
      data: { status },
    })
    return this.toListItem(updated)
  }
}
