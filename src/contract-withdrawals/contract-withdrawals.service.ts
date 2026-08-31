import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  ContractWithdrawalScope,
  ContractWithdrawalSource,
  ContractWithdrawalStatus,
  Prisma,
} from '@prisma/client'
import { createHash } from 'crypto'

import { resolveOtpRateLimitPeerIp } from '../auth/otp.service'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import type { AppLocale } from '../settings/localization.types'
import { SUPPORTED_LOCALES } from '../settings/localization.types'
import type { CountrySiteCode } from '../settings/market.types'
import { SettingsService } from '../settings/settings.service'
import { isAccountWithdrawalActionVisible } from './contract-withdrawal-eligibility'
import { generateContractWithdrawalReference } from './contract-withdrawal-reference.util'
import {
  escapeTemplateValue,
  fillWithdrawalTemplate,
  resolveWithdrawalReturnAddress,
} from './contract-withdrawal-template'
import type {
  ContractWithdrawalQueryDto,
  CreateAccountContractWithdrawalDto,
  CreatePublicContractWithdrawalDto,
} from './dto/contract-withdrawal.dto'

const EMAIL_RATE_MAX = 5
const IP_RATE_MAX = 10
const RATE_WINDOW_SEC = 3600
const MIN_FILL_MS = 2000
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

const SCOPE_LABELS: Record<ContractWithdrawalScope, Record<string, string>> = {
  ENTIRE_ORDER: {
    sk: 'Celé objednávke',
    cs: 'Celá objednávka',
    en: 'Entire order',
    uk: 'Відмова від усього договору',
    hu: 'Teljes rendelés',
    de: 'Gesamte Bestellung',
  },
  PARTIAL: {
    sk: 'Čiastočné odstúpenie',
    cs: 'Částečné odstoupení',
    en: 'Partial withdrawal',
    uk: 'Часткова відмова від договору',
    hu: 'Részleges elállás',
    de: 'Teilweiser Widerruf',
  },
}

export type ContractWithdrawalListItem = {
  id: string
  referenceNumber: string
  status: ContractWithdrawalStatus
  submittedAt: string
  customerName: string
  customerEmail: string
  customerPhone: string | null
  submittedOrderNumber: string
  orderId: string | null
  matchedOrderNumber: string | null
  scope: ContractWithdrawalScope
  partialItemsText: string | null
  source: ContractWithdrawalSource
  locale: string
  acknowledgementSentAt: string | null
  lineItems: Array<{
    orderItemId: string | null
    quantity: number
    titleSnapshot: string
    skuSnapshot: string | null
  }>
}

export type PublicContractWithdrawalResult = {
  ok: true
  referenceNumber: string
  submittedAt: string
}

@Injectable()
export class ContractWithdrawalsService {
  private readonly logger = new Logger(ContractWithdrawalsService.name)

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
    const ip = forwarded.startsWith('::ffff:') ? forwarded.slice(7) : forwarded.trim()
    if (!ip || ip.length > 45 || /[\s,;]/.test(ip)) return undefined
    return resolveOtpRateLimitPeerIp(ip) ?? ip
  }

  private hashIp(ip: string): string {
    return createHash('sha256').update(ip).digest('hex').slice(0, 32)
  }

  private normalizeLocale(raw: string | undefined): AppLocale {
    const locale = raw?.trim().toLowerCase() ?? ''
    return (SUPPORTED_LOCALES as readonly string[]).includes(locale)
      ? (locale as AppLocale)
      : 'sk'
  }

  private stripTags(value: string): string {
    return value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  }

  private async hitRateLimit(key: string, max: number): Promise<boolean> {
    const count = await this.redis.client.incr(key)
    if (count === 1) {
      await this.redis.client.expire(key, RATE_WINDOW_SEC)
    }
    return count > max
  }

  private formatOrderNumber(orderNumber: number): string {
    return String(orderNumber)
  }

  private parseSubmittedOrderNumber(raw: string): number | null {
    const digits = raw.replace(/\D/g, '')
    if (!digits) return null
    const n = Number(digits)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  private async tryMatchOrder(
    submittedOrderNumber: string,
    email: string,
  ): Promise<{ id: string; orderNumber: number } | null> {
    const parsed = this.parseSubmittedOrderNumber(submittedOrderNumber)
    if (!parsed) return null
    const normalizedEmail = email.trim().toLowerCase()
    const order = await this.prisma.order.findFirst({
      where: {
        orderNumber: parsed,
        OR: [
          { customerEmail: { equals: normalizedEmail, mode: 'insensitive' } },
          { user: { email: { equals: normalizedEmail, mode: 'insensitive' } } },
        ],
      },
      select: { id: true, orderNumber: true },
    })
    return order
  }

  private scopeLabel(scope: ContractWithdrawalScope, locale: AppLocale): string {
    return SCOPE_LABELS[scope][locale] ?? SCOPE_LABELS[scope].sk
  }

  private formatSubmittedAt(date: Date, locale: AppLocale): string {
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(date)
    } catch {
      return date.toISOString()
    }
  }

  private async buildAcknowledgement(input: {
    locale: AppLocale
    customerName: string
    orderNumber: string
    referenceNumber: string
    submittedAt: Date
    scope: ContractWithdrawalScope
    partialItemsText: string | null
    lineItems: Array<{ titleSnapshot: string; quantity: number }>
  }): Promise<{ subject: string; bodyText: string; bodyHtml: string }> {
    const withdrawalSettings = await this.settings.getWithdrawalSettings()
    const store = await this.settings.getStoreContactSettings()
    const template =
      withdrawalSettings.acknowledgementTemplates[input.locale] ??
      withdrawalSettings.acknowledgementTemplates.sk!
    const returnAddress = resolveWithdrawalReturnAddress({
      mode: withdrawalSettings.returnAddressMode,
      customAddress: withdrawalSettings.customReturnAddress,
      store,
    })
    const supportEmail =
      store.emails.find((row) => row.email.trim())?.email.trim() || ''
    const sellerName = store.companyDetails?.organizationName?.trim() || ''

    let partialItems = ''
    if (input.scope === ContractWithdrawalScope.PARTIAL) {
      if (input.lineItems.length > 0) {
        partialItems = input.lineItems
          .map((row) => `- ${row.titleSnapshot} — ${row.quantity}`)
          .join('\n')
      } else if (input.partialItemsText?.trim()) {
        partialItems = input.partialItemsText.trim()
      }
    }

    const vars: Record<string, string> = {
      customerName: input.customerName,
      orderNumber: input.orderNumber,
      withdrawalReference: input.referenceNumber,
      submittedAt: this.formatSubmittedAt(input.submittedAt, input.locale),
      withdrawalScope: this.scopeLabel(input.scope, input.locale),
      partialItems: partialItems ? `\n${partialItems}\n` : '',
      returnAddress,
      sellerName,
      supportEmail,
      phone: '',
    }

    const subject = fillWithdrawalTemplate(template.subject, vars).slice(0, 300)
    const bodyText = fillWithdrawalTemplate(template.body, vars)
    const bodyHtml = bodyText
      .split('\n')
      .map((line) => `<p>${escapeTemplateValue(line) || '&nbsp;'}</p>`)
      .join('')

    return { subject, bodyText, bodyHtml }
  }

  private async sendAcknowledgement(
    withdrawalId: string,
    to: string,
    payload: {
      locale: AppLocale
      customerName: string
      orderNumber: string
      referenceNumber: string
      submittedAt: Date
      scope: ContractWithdrawalScope
      partialItemsText: string | null
      lineItems: Array<{ titleSnapshot: string; quantity: number }>
      countrySiteCode?: string | null
    },
  ): Promise<void> {
    const ack = await this.buildAcknowledgement(payload)
    try {
      await this.mail.sendContractWithdrawalAcknowledgement({
        to,
        subject: ack.subject,
        text: ack.bodyText,
        html: ack.bodyHtml,
        countrySiteCode: (payload.countrySiteCode as CountrySiteCode | null | undefined) ?? null,
      })
      await this.prisma.contractWithdrawal.update({
        where: { id: withdrawalId },
        data: {
          acknowledgementSentAt: new Date(),
          acknowledgementLocale: payload.locale,
          acknowledgementSubjectSnapshot: ack.subject,
          acknowledgementBodySnapshot: ack.bodyText,
        },
      })
    } catch (err) {
      this.logger.warn(
        `Acknowledgement email failed for withdrawal ${withdrawalId}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      )
    }
  }

  private toListItem(row: {
    id: string
    referenceNumber: string
    status: ContractWithdrawalStatus
    submittedAt: Date
    customerName: string
    customerEmail: string
    customerPhone: string | null
    submittedOrderNumber: string
    orderId: string | null
    scope: ContractWithdrawalScope
    partialItemsText: string | null
    source: ContractWithdrawalSource
    locale: string
    acknowledgementSentAt: Date | null
    order: { orderNumber: number } | null
    lineItems: Array<{
      orderItemId: string | null
      quantity: number
      titleSnapshot: string
      skuSnapshot: string | null
    }>
  }): ContractWithdrawalListItem {
    return {
      id: row.id,
      referenceNumber: row.referenceNumber,
      status: row.status,
      submittedAt: row.submittedAt.toISOString(),
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      customerPhone: row.customerPhone,
      submittedOrderNumber: row.submittedOrderNumber,
      orderId: row.orderId,
      matchedOrderNumber: row.order ? this.formatOrderNumber(row.order.orderNumber) : null,
      scope: row.scope,
      partialItemsText: row.partialItemsText,
      source: row.source,
      locale: row.locale,
      acknowledgementSentAt: row.acknowledgementSentAt?.toISOString() ?? null,
      lineItems: row.lineItems.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.quantity,
        titleSnapshot: item.titleSnapshot,
        skuSnapshot: item.skuSnapshot,
      })),
    }
  }

  async createPublic(
    dto: CreatePublicContractWithdrawalDto,
    clientIp: string | undefined,
  ): Promise<PublicContractWithdrawalResult> {
    if (dto.fax?.trim()) {
      return this.buildPublicSuccess(new Date())
    }
    if (typeof dto.startedAt === 'number') {
      const elapsed = Date.now() - dto.startedAt
      if (elapsed >= 0 && elapsed < MIN_FILL_MS) {
        return this.buildPublicSuccess(new Date())
      }
    }

    const customerName = this.stripTags(dto.customerName).slice(0, 120)
    if (customerName.length < 2) {
      throw new BadRequestException('Вкажіть коректне імʼя.')
    }

    const email = dto.email.trim().toLowerCase()
    const submittedOrderNumber = dto.orderNumber.trim().slice(0, 64)
    if (!submittedOrderNumber) {
      throw new BadRequestException('Вкажіть номер замовлення.')
    }

    if (dto.scope === ContractWithdrawalScope.PARTIAL) {
      const text = dto.partialItemsText?.trim()
      if (!text) {
        throw new BadRequestException('Opíšte produkty a množstvá pre čiastočné odstúpenie.')
      }
      if (text.length > 4000) {
        throw new BadRequestException('Text je príliš dlhý.')
      }
    }

    const phone = dto.phone?.trim() ? this.stripTags(dto.phone).slice(0, 32) : null
    const locale = this.normalizeLocale(dto.locale)
    const partialItemsText =
      dto.scope === ContractWithdrawalScope.PARTIAL
        ? this.stripTags(dto.partialItemsText ?? '').slice(0, 4000)
        : null

    const emailKey = `cw:rl:email:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`
    if (await this.hitRateLimit(emailKey, EMAIL_RATE_MAX)) {
      throw new HttpException('Забагато заявок. Спробуйте пізніше.', HttpStatus.TOO_MANY_REQUESTS)
    }
    if (clientIp) {
      const ipKey = `cw:rl:ip:${this.hashIp(clientIp)}`
      if (await this.hitRateLimit(ipKey, IP_RATE_MAX)) {
        throw new HttpException('Забагато заявок. Спробуйте пізніше.', HttpStatus.TOO_MANY_REQUESTS)
      }
    }

    const matched = await this.tryMatchOrder(submittedOrderNumber, email)
    const referenceNumber = generateContractWithdrawalReference()
    const submittedAt = new Date()

    const created = await this.prisma.contractWithdrawal.create({
      data: {
        referenceNumber,
        orderId: matched?.id ?? null,
        submittedOrderNumber,
        customerName,
        customerEmail: email,
        customerPhone: phone,
        scope: dto.scope,
        partialItemsText,
        locale,
        source: ContractWithdrawalSource.PUBLIC_FORM,
        submittedAt,
        ipHash: clientIp ? this.hashIp(clientIp) : null,
      },
    })

    await this.sendAcknowledgement(created.id, email, {
      locale,
      customerName,
      orderNumber: submittedOrderNumber,
      referenceNumber,
      submittedAt,
      scope: dto.scope,
      partialItemsText,
      lineItems: [],
    })

    return {
      ok: true,
      referenceNumber,
      submittedAt: submittedAt.toISOString(),
    }
  }

  private buildPublicSuccess(submittedAt: Date): PublicContractWithdrawalResult {
    return {
      ok: true,
      referenceNumber: generateContractWithdrawalReference(submittedAt),
      submittedAt: submittedAt.toISOString(),
    }
  }

  async createFromAccount(
    userId: string,
    dto: CreateAccountContractWithdrawalDto,
  ): Promise<PublicContractWithdrawalResult> {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, userId },
      include: { items: true },
    })
    if (!order) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    const withdrawalSettings = await this.settings.getWithdrawalSettings()
    const visible = isAccountWithdrawalActionVisible(
      {
        onlineWithdrawalActionEnabled: order.onlineWithdrawalActionEnabled,
        deliveredAt: order.deliveredAt,
        status: order.status,
        cancelledAt: order.cancelledAt,
        buyerType: order.buyerType,
      },
      withdrawalSettings,
    )
    if (!visible) {
      throw new BadRequestException('Odstúpenie z účtu nie je pre túto objednávku dostupné.')
    }

    const locale = this.normalizeLocale(dto.locale ?? order.locale ?? undefined)
    const customerName = [order.customerFirstName, order.customerLastName]
      .filter(Boolean)
      .join(' ')
      .trim()
    const email = order.customerEmail?.trim().toLowerCase()
    if (!email) {
      throw new BadRequestException('Objednávka nemá e-mail na potvrdenie.')
    }

    let partialItemsText: string | null = null
    const lineItemCreates: Prisma.ContractWithdrawalLineItemCreateWithoutWithdrawalInput[] = []

    if (dto.scope === ContractWithdrawalScope.PARTIAL) {
      const selections = dto.lineItems ?? []
      if (selections.length === 0) {
        throw new BadRequestException('Vyberte položky pre čiastočné odstúpenie.')
      }
      const byId = new Map(order.items.map((item) => [item.id, item]))
      for (const selection of selections) {
        const item = byId.get(selection.orderItemId)
        if (!item) {
          throw new BadRequestException('Neplatná položka objednávky.')
        }
        if (selection.quantity > item.quantity) {
          throw new BadRequestException('Množstvo presahuje objednané množstvo.')
        }
        lineItemCreates.push({
          orderItemId: item.id,
          productVariantId: item.productVariantId,
          quantity: selection.quantity,
          titleSnapshot: [item.productName, item.variantLabel].filter(Boolean).join(' — '),
          skuSnapshot: item.sku,
        })
      }
      partialItemsText = lineItemCreates
        .map((row) => `${row.titleSnapshot} — ${row.quantity}`)
        .join('\n')
    }

    const referenceNumber = generateContractWithdrawalReference()
    const submittedAt = new Date()
    const submittedOrderNumber = this.formatOrderNumber(order.orderNumber)

    const created = await this.prisma.contractWithdrawal.create({
      data: {
        referenceNumber,
        orderId: order.id,
        submittedOrderNumber,
        userId,
        customerName,
        customerEmail: email,
        customerPhone: order.customerPhone,
        scope: dto.scope,
        partialItemsText,
        locale,
        source: ContractWithdrawalSource.ACCOUNT,
        submittedAt,
        lineItems: lineItemCreates.length
          ? { create: lineItemCreates }
          : undefined,
      },
      include: { lineItems: true },
    })

    await this.sendAcknowledgement(created.id, email, {
      locale,
      customerName,
      orderNumber: submittedOrderNumber,
      referenceNumber,
      submittedAt,
      scope: dto.scope,
      partialItemsText,
      lineItems: created.lineItems.map((row) => ({
        titleSnapshot: row.titleSnapshot,
        quantity: row.quantity,
      })),
      countrySiteCode: order.countrySiteCode,
    })

    return {
      ok: true,
      referenceNumber,
      submittedAt: submittedAt.toISOString(),
    }
  }

  async getAccountOrderWithdrawalMeta(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        orderNumber: true,
        customerFirstName: true,
        customerLastName: true,
        customerEmail: true,
        customerPhone: true,
        onlineWithdrawalActionEnabled: true,
        deliveredAt: true,
        status: true,
        cancelledAt: true,
        buyerType: true,
        items: {
          select: {
            id: true,
            quantity: true,
            productName: true,
            variantLabel: true,
            sku: true,
          },
        },
      },
    })
    if (!order) throw new NotFoundException('Замовлення не знайдено.')

    const withdrawalSettings = await this.settings.getWithdrawalSettings()
    const actionVisible = isAccountWithdrawalActionVisible(
      {
        onlineWithdrawalActionEnabled: order.onlineWithdrawalActionEnabled,
        deliveredAt: order.deliveredAt,
        status: order.status,
        cancelledAt: order.cancelledAt,
        buyerType: order.buyerType,
      },
      withdrawalSettings,
    )

    return {
      actionVisible,
      orderNumber: this.formatOrderNumber(order.orderNumber),
      customerName: [order.customerFirstName, order.customerLastName].filter(Boolean).join(' '),
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      items: order.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        productName: item.productName,
        variantLabel: item.variantLabel,
        sku: item.sku,
        label: [item.productName, item.variantLabel].filter(Boolean).join(' — '),
      })),
    }
  }

  async findAllBackstage(query: ContractWithdrawalQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const where = query.status ? { status: query.status } : {}

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contractWithdrawal.count({ where }),
      this.prisma.contractWithdrawal.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: { select: { orderNumber: true } },
          lineItems: true,
        },
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

  async findOneBackstage(id: string): Promise<ContractWithdrawalListItem> {
    const row = await this.prisma.contractWithdrawal.findUnique({
      where: { id },
      include: {
        order: { select: { orderNumber: true } },
        lineItems: true,
      },
    })
    if (!row) throw new NotFoundException('Žiadosť nebola nájdená.')
    return this.toListItem(row)
  }

  async updateStatusBackstage(
    id: string,
    status: ContractWithdrawalStatus,
  ): Promise<ContractWithdrawalListItem> {
    const existing = await this.prisma.contractWithdrawal.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException('Žiadosť nebola nájdená.')
    const updated = await this.prisma.contractWithdrawal.update({
      where: { id },
      data: { status },
      include: {
        order: { select: { orderNumber: true } },
        lineItems: true,
      },
    })
    return this.toListItem(updated)
  }

  async countSubmittedBackstage(): Promise<{ count: number }> {
    const count = await this.prisma.contractWithdrawal.count({
      where: { status: ContractWithdrawalStatus.SUBMITTED },
    })
    return { count }
  }
}
