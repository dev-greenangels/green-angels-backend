import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { phoneE164ToTurboSms } from '../auth/auth.utils'
import { validatePhoneForPolicy } from '../auth/market-phone.util'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../prisma/prisma.service'
import { QueueService } from '../queue/queue.service'
import { SettingsService } from '../settings/settings.service'
import { TurboSmsService } from '../turbosms/turbosms.service'
import { CreateStockNotificationDto } from './dto/create-stock-notification.dto'
import { StockNotificationQueryDto } from './dto/stock-notification-query.dto'

const CYRILLIC_NAME_REGEX = /^[А-Яа-яІіЇїЄєҐґ'ʼ]{2,}$/
const LATIN_NAME_REGEX =
  /^[A-Za-zÀ-ÖØ-öø-ÿĀ-žĄąĆćČčĎďĐđĘęĚěĹĺĽľŁłŃńŇňŐőŘřŚśŠšŤťŮůŰűŹźŻżŽž'ʼ\- ]{2,}$/

const LOCALES = new Set(['uk', 'en', 'sk', 'hu', 'de', 'cs'])
const DEFAULT_PAGE_SIZE = 20
const SEND_BATCH = 40

export type StockNotificationListItem = {
  id: string
  productId: string
  productName: string
  productSlug: string
  categorySlug: string
  name: string
  email: string | null
  phone: string | null
  locale: string
  consentAt: string | null
  notifiedAt: string | null
  createdAt: string
}

@Injectable()
export class StockNotificationsService {
  private readonly logger = new Logger(StockNotificationsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    private readonly turboSms: TurboSmsService,
    @Inject(forwardRef(() => QueueService))
    private readonly queue: QueueService,
  ) {}

  private assertValidName(name: string, region: 'ua' | 'sk') {
    const trimmed = name.trim()
    if (region === 'sk') {
      if (!LATIN_NAME_REGEX.test(trimmed) || !/[A-Za-zÀ-ÖØ-öø-ÿĀ-ž]/.test(trimmed)) {
        throw new BadRequestException(
          'Meno musí obsahovať iba písmená (minimálne 2 znaky).',
        )
      }
      return
    }
    if (!CYRILLIC_NAME_REGEX.test(trimmed)) {
      throw new BadRequestException(
        'Імʼя має містити лише літери (мінімум 2 символи).',
      )
    }
  }

  private normalizeLocale(locale?: string) {
    const value = locale?.trim().toLowerCase() ?? ''
    return LOCALES.has(value) ? value : 'uk'
  }

  scheduleRestockNotify(productId: string) {
    void this.queue.enqueueStockAvailable({ productId }).catch((err) => {
      this.logger.warn(
        `stock-available enqueue failed for ${productId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    })
  }

  async create(dto: CreateStockNotificationDto) {
    const market = await this.settings.getMarketSettings()
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, isPublished: true },
      select: { id: true },
    })
    if (!product) {
      throw new NotFoundException('Товар не знайдено.')
    }

    const name = dto.name.trim()
    this.assertValidName(name, market.region === 'sk' ? 'sk' : 'ua')

    const locale = this.normalizeLocale(dto.locale)
    const email = dto.email?.trim().toLowerCase() || null
    let phone: string | null = null
    if (dto.phone?.trim()) {
      phone = validatePhoneForPolicy(dto.phone, market.authPhonePolicy)
      if (!phone) {
        throw new BadRequestException(
          market.region === 'sk'
            ? 'Zadajte platné telefónne číslo (+421).'
            : 'Номер має починатися з +380 (ще 9 цифр) або з 0 (ще 9 цифр, разом 10)',
        )
      }
    }

    if (!email && !phone) {
      throw new BadRequestException('Вкажіть email або номер телефону.')
    }

    if (email) {
      const duplicateEmail = await this.prisma.productStockNotification.findFirst({
        where: { productId: dto.productId, notifiedAt: null, email },
        select: { id: true },
      })
      if (duplicateEmail) {
        return {
          ok: true as const,
          alreadySubscribed: true as const,
          id: duplicateEmail.id,
          message:
            'Ви вже підписані на сповіщення про цю рослину за цим email. Коли товар з’явиться на складі, ми повідомимо вас автоматично.',
        }
      }
    }

    if (phone) {
      const duplicatePhone = await this.prisma.productStockNotification.findFirst({
        where: { productId: dto.productId, notifiedAt: null, phone },
        select: { id: true },
      })
      if (duplicatePhone) {
        return {
          ok: true as const,
          alreadySubscribed: true as const,
          id: duplicatePhone.id,
          message:
            'Ви вже підписані на сповіщення про цю рослину за цим номером телефону. Коли товар з’явиться на складі, ми повідомимо вас автоматично.',
        }
      }
    }

    const created = await this.prisma.productStockNotification.create({
      data: {
        productId: dto.productId,
        name,
        email,
        phone,
        locale,
        consentAt: new Date(),
      },
      select: { id: true },
    })

    return {
      ok: true as const,
      alreadySubscribed: false as const,
      id: created.id,
      message:
        'Дякуємо! Заявку збережено. Коли товар з’явиться на складі, ми повідомимо вас автоматично.',
    }
  }

  async findAllBackstage(query: StockNotificationQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1
    const pageSize = Math.min(query.pageSize || DEFAULT_PAGE_SIZE, 50)
    const skip = (page - 1) * pageSize
    const status = query.status && query.status !== 'all' ? query.status : null
    const channel = query.channel && query.channel !== 'all' ? query.channel : null
    const q = query.q?.trim() || ''

    const where: Prisma.ProductStockNotificationWhereInput = {}
    if (status === 'pending') where.notifiedAt = null
    if (status === 'notified') where.notifiedAt = { not: null }
    if (channel === 'email') where.email = { not: null }
    if (channel === 'phone') where.phone = { not: null }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { product: { slug: { contains: q, mode: 'insensitive' } } },
        {
          product: {
            translations: { some: { name: { contains: q, mode: 'insensitive' } } },
          },
        },
      ]
    }

    const [total, rows] = await Promise.all([
      this.prisma.productStockNotification.count({ where }),
      this.prisma.productStockNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          product: {
            select: {
              slug: true,
              category: { select: { slug: true } },
              translations: {
                where: { locale: 'uk' },
                take: 1,
                select: { name: true },
              },
            },
          },
        },
      }),
    ])

    const items: StockNotificationListItem[] = rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      productName: row.product.translations[0]?.name ?? row.product.slug,
      productSlug: row.product.slug,
      categorySlug: row.product.category.slug,
      name: row.name,
      email: row.email,
      phone: row.phone,
      locale: row.locale,
      consentAt: row.consentAt?.toISOString() ?? null,
      notifiedAt: row.notifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }))

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: total ? Math.max(1, Math.ceil(total / pageSize)) : 0,
    }
  }

  async countPendingBackstage() {
    const count = await this.prisma.productStockNotification.count({
      where: { notifiedAt: null },
    })
    return { count }
  }

  async deleteOne(id: string) {
    const existing = await this.prisma.productStockNotification.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('Заявку не знайдено.')
    await this.prisma.productStockNotification.delete({ where: { id } })
    return { ok: true as const }
  }

  async deleteMany(ids: string[]) {
    const unique = [...new Set(ids)]
    const result = await this.prisma.productStockNotification.deleteMany({
      where: { id: { in: unique } },
    })
    return { ok: true as const, deleted: result.count }
  }

  async enqueueSend(ids: string[]) {
    const unique = [...new Set(ids)]
    const pending = await this.prisma.productStockNotification.findMany({
      where: { id: { in: unique }, notifiedAt: null },
      select: { id: true },
    })
    if (!pending.length) {
      throw new BadRequestException('Немає заявок для відправки.')
    }
    await this.queue.enqueueStockAvailable({
      notificationIds: pending.map((row) => row.id),
    })
    return { ok: true as const, queued: pending.length }
  }

  async processSendJob(input: { productId?: string; notificationIds?: string[] }) {
    if (input.productId) {
      const inStock = await this.productHasSellableStock(input.productId)
      if (!inStock) {
        this.logger.log(`stock-available skip ${input.productId}: немає наявності`)
        return { sent: 0, skipped: 0, reason: 'no_stock' as const }
      }
    }

    const baseWhere: Prisma.ProductStockNotificationWhereInput = { notifiedAt: null }
    if (input.notificationIds?.length) {
      baseWhere.id = { in: input.notificationIds }
    } else if (input.productId) {
      baseWhere.productId = input.productId
    } else {
      return { sent: 0, skipped: 0, reason: 'empty' as const }
    }

    let sent = 0
    let skipped = 0
    const failedIds: string[] = []

    for (;;) {
      const where: Prisma.ProductStockNotificationWhereInput = {
        ...baseWhere,
        notifiedAt: null,
      }
      if (failedIds.length) {
        where.id = input.notificationIds?.length
          ? { in: input.notificationIds, notIn: failedIds }
          : { notIn: failedIds }
      }

      const batch = await this.prisma.productStockNotification.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: SEND_BATCH,
        select: { id: true, productId: true },
      })
      if (!batch.length) break

      for (const row of batch) {
        const hasStock = await this.productHasSellableStock(row.productId)
        if (!hasStock) {
          skipped += 1
          failedIds.push(row.id)
          continue
        }
        try {
          await this.sendOne(row.id)
          sent += 1
        } catch (err) {
          failedIds.push(row.id)
          skipped += 1
          this.logger.warn(
            `stock notify ${row.id}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
    }

    return { sent, skipped }
  }

  private async productHasSellableStock(productId: string): Promise<boolean> {
    const variants = await this.prisma.productVariant.findMany({
      where: { productId },
      select: { stock: true },
    })
    return variants.some((variant) => variant.stock > 0)
  }

  private async sendOne(id: string) {
    const row = await this.prisma.productStockNotification.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            slug: true,
            category: { select: { slug: true } },
            translations: { select: { locale: true, name: true } },
          },
        },
      },
    })
    if (!row || row.notifiedAt) return

    const locale = this.normalizeLocale(row.locale)
    const productName =
      row.product.translations.find((item) => item.locale === locale)?.name ||
      row.product.translations.find((item) => item.locale === 'uk')?.name ||
      row.product.translations[0]?.name ||
      row.product.slug
    const productUrl = this.mail.buildLocalizedProductUrl(
      locale,
      row.product.category.slug,
      row.product.slug,
    )

    let delivered = false
    if (row.email) {
      if (!this.mail.isConfigured()) {
        this.logger.warn(`SMTP не налаштовано — лист не надіслано для ${id}`)
      } else {
        await this.mail.sendStockAvailableEmail({
          to: row.email,
          name: row.name,
          productName,
          productUrl,
          locale,
        })
        delivered = true
      }
    }
    if (row.phone) {
      if (this.turboSms.isConfigured()) {
        const text = this.smsText(locale, productName, productUrl)
        await this.turboSms.sendSms(phoneE164ToTurboSms(row.phone), text)
        delivered = true
      } else {
        this.logger.warn(`TurboSMS не налаштовано — SMS не надіслано для ${id}`)
        if (!row.email) {
          throw new Error('SMS не налаштовано')
        }
      }
    }

    if (!delivered) throw new Error('Немає каналу відправки')

    await this.prisma.productStockNotification.updateMany({
      where: { id, notifiedAt: null },
      data: { notifiedAt: new Date() },
    })
  }

  private smsText(locale: string, productName: string, url: string) {
    const shortName = productName.slice(0, 40)
    if (locale === 'sk') return `Green Angels: ${shortName} je opäť na sklade. ${url}`
    if (locale === 'en') return `Green Angels: ${shortName} is back in stock. ${url}`
    return `Зелені Янголи: ${shortName} знову в наявності. ${url}`
  }
}
