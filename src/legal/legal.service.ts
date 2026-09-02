import { createHash } from 'node:crypto'

import ExcelJS from 'exceljs'
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import {
  LegalConsentAction,
  LegalConsentPurpose,
  LegalDocumentType,
  LegalRevisionStatus,
  Prisma,
} from '@prisma/client'

import type { SessionJwtPayload } from '../auth/auth.constants'
import { resolveShopPublicOrigin } from '../mail/country-hosts'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import { CreateLegalRevisionDto, UpdateLegalRevisionDto } from './dto/create-revision.dto'
import type { MarketingSubscribersExportQueryDto } from './dto/marketing-subscribers-query.dto'
import type { MarketingSubscribersQueryDto } from './dto/marketing-subscribers-query.dto'
import { RecordConsentDto } from './dto/record-consent.dto'
import {
  MARKETING_SUBSCRIBERS_BASE_SQL,
  mapMarketingSubscriberRow,
  resolveMarketingSubscribersSort,
  type MarketingConsentSummary,
  type MarketingSubscriberPage,
} from './marketing-subscribers.types'
import { getLegalSeedForMarket, type LegalSeedSection } from './legal-seed'
import {
  resolveDeployMarketFromEnv,
  resolveDeployMarketFromRegion,
} from './legal-market'
import type { LegalSeedEntry } from './legal-seed.types'
import type { MarketRegion } from '../settings/market.types'
import {
  EMPTY_SELLER,
  interpolateLegalText,
  resolveLegalSeller,
  resolveSupportEmail,
  sellerPlaceholderVars,
  type LegalSellerIdentity,
} from './legal-seller'

const LOCALE_FALLBACKS: Record<string, string[]> = {
  uk: ['uk', 'en'],
  en: ['en', 'sk', 'uk'],
  sk: ['sk', 'en'],
  hu: ['hu', 'en', 'sk'],
  de: ['de', 'en', 'sk'],
  cs: ['cs', 'en', 'sk'],
}

const PURPOSE_DOCUMENT: Record<LegalConsentPurpose, LegalDocumentType> = {
  TERMS: LegalDocumentType.TERMS,
  PRIVACY_NOTICE: LegalDocumentType.PRIVACY,
  COOKIES_ANALYTICS: LegalDocumentType.COOKIES,
  MARKETING: LegalDocumentType.MARKETING_CONSENT,
}

export type LegalPublicDocument = {
  id: string
  type: LegalDocumentType
  revisionId: string
  locale: string
  version: number
  title: string
  intro: string
  sections: LegalSeedSection[]
  contentHash: string
  effectiveAt: string
  publishedAt: string | null
  seller: LegalSellerIdentity
}

@Injectable()
export class LegalService {
  private readonly logger = new Logger(LegalService.name)
  private seedPromise: Promise<void> | null = null
  private marketSeedPromise: Promise<LegalSeedEntry[]> | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async getCurrent(localeRaw?: string): Promise<{ items: LegalPublicDocument[] }> {
    await this.ensureSeeded()
    const locale = this.normalizeLocale(localeRaw)
    const types = Object.values(LegalDocumentType)
    const items: LegalPublicDocument[] = []
    for (const type of types) {
      const doc = await this.findPublished(type, locale)
      if (doc) items.push(doc)
    }
    return { items }
  }

  async getByType(typeRaw: string, localeRaw?: string): Promise<LegalPublicDocument> {
    await this.ensureSeeded()
    const type = this.parseType(typeRaw)
    const locale = this.normalizeLocale(localeRaw)
    const doc = await this.findPublished(type, locale)
    if (!doc) {
      throw new NotFoundException('Документ не знайдено.')
    }
    return doc
  }

  async listAdmin(localeRaw?: string) {
    await this.ensureSeeded()
    const localeFilter = localeRaw?.trim().toLowerCase()
    const documents = await this.prisma.legalDocument.findMany({
      orderBy: { type: 'asc' },
      include: {
        revisions: {
          where: localeFilter ? { locale: localeFilter } : undefined,
          orderBy: [{ locale: 'asc' }, { version: 'desc' }],
          take: 40,
        },
      },
    })
    return {
      items: documents.map((document) => ({
        id: document.id,
        type: document.type,
        revisions: document.revisions.map((revision) => this.mapRevision(revision)),
      })),
    }
  }

  async createDraft(dto: CreateLegalRevisionDto, actor?: SessionJwtPayload) {
    await this.ensureSeeded()
    const type = this.parseType(dto.type)
    const locale = this.normalizeLocale(dto.locale)
    const document = await this.prisma.legalDocument.upsert({
      where: { type },
      create: { type },
      update: {},
    })

    let title = dto.title?.trim()
    let intro = dto.intro?.trim()
    let sections = dto.sections

    if (dto.fromRevisionId) {
      const source = await this.prisma.legalDocumentRevision.findUnique({
        where: { id: dto.fromRevisionId },
      })
      if (!source || source.documentId !== document.id) {
        throw new BadRequestException('Редакцію-джерело не знайдено.')
      }
      const parsed = this.parseContent(source.content)
      title = title || source.title
      intro = intro ?? source.intro
      sections = sections ?? parsed
    }

    if (!title || intro == null || !sections?.length) {
      throw new BadRequestException('Потрібні назва, вступ і розділи.')
    }

    const max = await this.prisma.legalDocumentRevision.aggregate({
      where: { documentId: document.id, locale },
      _max: { version: true },
    })
    const version = (max._max.version ?? 0) + 1
    const content = JSON.stringify(sections)
    const created = await this.prisma.legalDocumentRevision.create({
      data: {
        documentId: document.id,
        locale,
        version,
        title,
        intro,
        content,
        contentHash: this.hashContent(locale, title, intro, content),
        status: LegalRevisionStatus.DRAFT,
        createdById: actor?.userId ?? null,
      },
    })
    return this.mapRevision(created)
  }

  async updateDraft(id: string, dto: UpdateLegalRevisionDto) {
    const revision = await this.prisma.legalDocumentRevision.findUnique({ where: { id } })
    if (!revision) throw new NotFoundException('Редакцію не знайдено.')
    if (revision.status !== LegalRevisionStatus.DRAFT) {
      throw new BadRequestException('Опубліковану редакцію не можна змінювати. Створіть нову.')
    }
    const title = dto.title?.trim() || revision.title
    const intro = dto.intro != null ? dto.intro.trim() : revision.intro
    const content = dto.sections ? JSON.stringify(dto.sections) : revision.content
    const updated = await this.prisma.legalDocumentRevision.update({
      where: { id },
      data: {
        title,
        intro,
        content,
        contentHash: this.hashContent(revision.locale, title, intro, content),
      },
    })
    return this.mapRevision(updated)
  }

  async publish(id: string) {
    const revision = await this.prisma.legalDocumentRevision.findUnique({
      where: { id },
      include: { document: true },
    })
    if (!revision) throw new NotFoundException('Редакцію не знайдено.')
    if (revision.status === LegalRevisionStatus.PUBLISHED) {
      return this.mapRevision(revision)
    }
    if (revision.status !== LegalRevisionStatus.DRAFT) {
      throw new BadRequestException('Архівовану редакцію не можна публікувати.')
    }

    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.legalDocumentRevision.updateMany({
        where: {
          documentId: revision.documentId,
          locale: revision.locale,
          status: LegalRevisionStatus.PUBLISHED,
          id: { not: revision.id },
        },
        data: { status: LegalRevisionStatus.ARCHIVED },
      })
      await tx.legalDocumentRevision.update({
        where: { id: revision.id },
        data: {
          status: LegalRevisionStatus.PUBLISHED,
          publishedAt: now,
          effectiveAt: now,
        },
      })
    })

    if (revision.document.type === LegalDocumentType.PRIVACY) {
      try {
        await this.settings.updateMarket({
          privacyConsentVersion: String(revision.version),
        })
      } catch (error) {
        this.logger.warn(
          `Не вдалося синхронізувати privacyConsentVersion: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    const published = await this.prisma.legalDocumentRevision.findUnique({ where: { id } })
    return this.mapRevision(published!)
  }

  async recordConsent(dto: RecordConsentDto, userId?: string) {
    await this.ensureSeeded()
    const purpose = dto.purpose as LegalConsentPurpose
    const action = dto.action as LegalConsentAction
    const locale = this.normalizeLocale(dto.locale)
    const source = dto.source?.trim() || 'unknown'
    const email = dto.email?.trim().toLowerCase() || null
    let revision = dto.revisionId
      ? await this.prisma.legalDocumentRevision.findUnique({
          where: { id: dto.revisionId },
          include: { document: true },
        })
      : null

    if (revision && revision.document.type !== PURPOSE_DOCUMENT[purpose]) {
      revision = null
    }
    if (!revision) {
      const current = await this.findPublishedRow(PURPOSE_DOCUMENT[purpose], locale)
      revision = current
    }
    if (!revision) {
      return { recorded: false }
    }

    let resolvedUserId = userId || null
    if (!resolvedUserId && email) {
      const byEmail = await this.prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: { id: true },
      })
      resolvedUserId = byEmail?.id ?? null
    }

    const event = await this.prisma.legalConsentEvent.create({
      data: {
        userId: resolvedUserId,
        orderId: dto.orderId || null,
        anonymousConsentId: dto.anonymousConsentId?.trim() || null,
        revisionId: revision.id,
        purpose,
        action,
        locale: revision.locale,
        source: source.slice(0, 40),
        documentHash: revision.contentHash,
        metadata: {
          ...(dto.metadata ?? {}),
          ...(dto.analytics != null ? { analytics: dto.analytics } : {}),
          ...(email ? { email } : {}),
          seller: await this.getSeller(),
        } as Prisma.InputJsonValue,
      },
    })

    if (purpose === LegalConsentPurpose.MARKETING) {
      await this.syncMarketingUserFlags({
        userId: resolvedUserId,
        email,
        action,
      })
    }

    return {
      recorded: true,
      id: event.id,
      revisionId: revision.id,
      version: revision.version,
      occurredAt: event.occurredAt.toISOString(),
    }
  }

  async recordCheckoutConsents(params: {
    orderId: string
    userId?: string | null
    locale?: string
    privacyConsent: boolean
    marketingConsent?: boolean
    termsRevisionId?: string
    privacyRevisionId?: string
    marketingRevisionId?: string
    email?: string | null
  }): Promise<void> {
    const locale = this.normalizeLocale(params.locale)
    try {
      if (params.privacyConsent) {
        await this.recordConsent(
          {
            purpose: 'PRIVACY_NOTICE',
            action: 'ACKNOWLEDGED',
            locale,
            source: 'CHECKOUT',
            revisionId: params.privacyRevisionId,
            orderId: params.orderId,
          },
          params.userId ?? undefined,
        )
        await this.recordConsent(
          {
            purpose: 'TERMS',
            action: 'ACKNOWLEDGED',
            locale,
            source: 'CHECKOUT',
            revisionId: params.termsRevisionId,
            orderId: params.orderId,
          },
          params.userId ?? undefined,
        )
      }
      if (params.marketingConsent) {
        await this.recordConsent(
          {
            purpose: 'MARKETING',
            action: 'GRANTED',
            locale,
            source: 'CHECKOUT',
            revisionId: params.marketingRevisionId,
            orderId: params.orderId,
            email: params.email?.trim() || undefined,
          },
          params.userId ?? undefined,
        )
      }
    } catch (error) {
      this.logger.warn(
        `Consent log skipped for order ${params.orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  async listMarketingSubscribersBackstage(
    query: MarketingSubscribersQueryDto,
  ): Promise<MarketingSubscriberPage> {
    const page = query.page && query.page > 0 ? query.page : 1
    const pageSize = Math.min(query.pageSize ?? 20, 50)
    const { whereSql, params } = this.buildMarketingSubscribersFilters(query)
    const orderBy = resolveMarketingSubscribersSort(query.sortBy, query.sortDir)

    const countRows = await this.prisma.$queryRawUnsafe<{ total: bigint }[]>(
      `${MARKETING_SUBSCRIBERS_BASE_SQL}
SELECT COUNT(*)::bigint AS total
FROM subscribers
${whereSql}`,
      ...params,
    )
    const total = Number(countRows[0]?.total ?? 0)
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const offset = (page - 1) * pageSize

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        subscriber_key: string
        userId: string | null
        email: string | null
        firstName: string | null
        lastName: string | null
        source: string | null
        status: string
        subscribedAt: Date | null
        unsubscribedAt: Date | null
        isRegistered: boolean
      }>
    >(
      `${MARKETING_SUBSCRIBERS_BASE_SQL}
SELECT *
FROM subscribers
${whereSql}
ORDER BY ${orderBy}
LIMIT $${params.length + 1}
OFFSET $${params.length + 2}`,
      ...params,
      pageSize,
      offset,
    )

    return {
      items: rows.map(mapMarketingSubscriberRow),
      total,
      page,
      pageSize,
      totalPages,
    }
  }

  async exportMarketingSubscribersBackstage(
    query: MarketingSubscribersExportQueryDto,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv'
    const { whereSql, params } = this.buildMarketingSubscribersFilters(query)
    const orderBy = resolveMarketingSubscribersSort(query.sortBy, query.sortDir)

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        subscriber_key: string
        userId: string | null
        email: string | null
        firstName: string | null
        lastName: string | null
        source: string | null
        status: string
        subscribedAt: Date | null
        unsubscribedAt: Date | null
        isRegistered: boolean
      }>
    >(
      `${MARKETING_SUBSCRIBERS_BASE_SQL}
SELECT *
FROM subscribers
${whereSql}
ORDER BY ${orderBy}
LIMIT 50000`,
      ...params,
    )

    const items = rows.map(mapMarketingSubscriberRow)
    const exportRows = await this.attachMarketingUnsubscribeUrls(items)
    const stamp = new Date().toISOString().slice(0, 10)

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('Subscribers')
      sheet.columns = [
        { header: 'Email', key: 'email', width: 32 },
        { header: 'First name', key: 'firstName', width: 18 },
        { header: 'Last name', key: 'lastName', width: 18 },
        { header: 'Source', key: 'source', width: 20 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Subscribed at', key: 'subscribedAt', width: 22 },
        { header: 'Unsubscribed at', key: 'unsubscribedAt', width: 22 },
        { header: 'Registered client', key: 'isRegistered', width: 18 },
        { header: 'Unsubscribe URL', key: 'unsubscribeUrl', width: 72 },
      ]
      for (const row of exportRows) {
        sheet.addRow({
          email: row.email ?? '',
          firstName: row.firstName ?? '',
          lastName: row.lastName ?? '',
          source: row.source ?? '',
          status: row.status,
          subscribedAt: row.subscribedAt ?? '',
          unsubscribedAt: row.unsubscribedAt ?? '',
          isRegistered: row.isRegistered ? 'yes' : 'no',
          unsubscribeUrl: row.unsubscribeUrl,
        })
      }
      const raw = await workbook.xlsx.writeBuffer()
      return {
        buffer: Buffer.from(raw),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `marketing-subscribers-${stamp}.xlsx`,
      }
    }

    const header = [
      'email',
      'firstName',
      'lastName',
      'source',
      'status',
      'subscribedAt',
      'unsubscribedAt',
      'isRegistered',
      'unsubscribeUrl',
    ]
    const lines = [
      header.join(';'),
      ...exportRows.map((row) =>
        [
          this.csvCell(row.email),
          this.csvCell(row.firstName),
          this.csvCell(row.lastName),
          this.csvCell(row.source),
          this.csvCell(row.status),
          this.csvCell(row.subscribedAt),
          this.csvCell(row.unsubscribedAt),
          row.isRegistered ? 'yes' : 'no',
          this.csvCell(row.unsubscribeUrl),
        ].join(';'),
      ),
    ]

    return {
      buffer: Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8'),
      contentType: 'text/csv; charset=utf-8',
      filename: `marketing-subscribers-${stamp}.csv`,
    }
  }

  async getMarketingConsentSummary(input: {
    userId?: string | null
    email?: string | null
  }): Promise<MarketingConsentSummary> {
    const userId = input.userId?.trim() || null
    const email = input.email?.trim().toLowerCase() || null
    if (!userId && !email) {
      return {
        subscribed: false,
        source: null,
        subscribedAt: null,
        unsubscribedAt: null,
      }
    }

    const or: Prisma.LegalConsentEventWhereInput[] = []
    if (userId) or.push({ userId })
    if (email) or.push({ metadata: { path: ['email'], equals: email } })

    const latest = await this.prisma.legalConsentEvent.findFirst({
      where: { purpose: LegalConsentPurpose.MARKETING, OR: or },
      orderBy: { occurredAt: 'desc' },
      select: { action: true, occurredAt: true },
    })

    const latestGranted = await this.prisma.legalConsentEvent.findFirst({
      where: {
        purpose: LegalConsentPurpose.MARKETING,
        action: LegalConsentAction.GRANTED,
        OR: or,
      },
      orderBy: { occurredAt: 'desc' },
      select: { source: true, occurredAt: true },
    })

    const latestWithdrawn = await this.prisma.legalConsentEvent.findFirst({
      where: {
        purpose: LegalConsentPurpose.MARKETING,
        action: LegalConsentAction.WITHDRAWN,
        OR: or,
      },
      orderBy: { occurredAt: 'desc' },
      select: { occurredAt: true },
    })

    const subscribed = latest?.action === LegalConsentAction.GRANTED

    return {
      subscribed,
      source: latestGranted?.source ?? null,
      subscribedAt: latestGranted?.occurredAt.toISOString() ?? null,
      unsubscribedAt:
        latest?.action === LegalConsentAction.WITHDRAWN
          ? latestWithdrawn?.occurredAt.toISOString() ?? latest.occurredAt.toISOString()
          : null,
    }
  }

  private resolveShopPublicBaseUrl(): string {
    return resolveShopPublicOrigin({
      countrySiteCode: null,
      countryHostsEnv: process.env.GA_COUNTRY_HOSTS,
      shopPublicUrl: process.env.SHOP_PUBLIC_URL,
      corsOrigin: process.env.CORS_ORIGIN,
    })
  }

  private async resolveMarketingExportLocale(): Promise<string> {
    try {
      const market = await this.settings.getMarketSettings()
      return market.region === 'sk' ? 'sk' : 'uk'
    } catch {
      return 'uk'
    }
  }

  private async attachMarketingUnsubscribeUrls(
    items: Array<{
      userId: string | null
      email: string | null
      firstName: string | null
      lastName: string | null
      source: string | null
      status: string
      subscribedAt: string | null
      unsubscribedAt: string | null
      isRegistered: boolean
      subscriberKey: string
    }>,
  ): Promise<
    Array<{
      userId: string | null
      email: string | null
      firstName: string | null
      lastName: string | null
      source: string | null
      status: string
      subscribedAt: string | null
      unsubscribedAt: string | null
      isRegistered: boolean
      subscriberKey: string
      unsubscribeUrl: string
    }>
  > {
    const shopPublicBaseUrl = this.resolveShopPublicBaseUrl()
    const locale = await this.resolveMarketingExportLocale()

    return items.map((row) => ({
      ...row,
      unsubscribeUrl:
        this.buildMarketingUnsubscribeUrl({
          shopPublicBaseUrl,
          userId: row.userId,
          email: row.email,
          locale,
        }) ?? '',
    }))
  }

  private buildMarketingSubscribersFilters(query: MarketingSubscribersQueryDto): {
    whereSql: string
    params: unknown[]
  } {
    const params: unknown[] = []
    const clauses: string[] = []

    const status = query.status?.trim().toLowerCase()
    if (status === 'active') {
      clauses.push(`status = 'active'`)
    } else if (status === 'withdrawn') {
      clauses.push(`status = 'withdrawn'`)
    }

    const q = query.q?.trim()
    if (q) {
      params.push(`%${q}%`)
      const idx = params.length
      clauses.push(
        `(email ILIKE $${idx} OR "firstName" ILIKE $${idx} OR "lastName" ILIKE $${idx})`,
      )
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    return { whereSql, params }
  }

  private csvCell(value: string | null | undefined): string {
    const raw = value ?? ''
    if (/[;"\n\r]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`
    }
    return raw
  }

  /** Latest MARKETING event for user/email must be GRANTED. */
  async hasActiveMarketingConsent(input: {
    userId?: string | null
    email?: string | null
  }): Promise<boolean> {
    const userId = input.userId?.trim() || null
    const email = input.email?.trim().toLowerCase() || null
    if (!userId && !email) return false

    const latest = await this.prisma.legalConsentEvent.findFirst({
      where: {
        purpose: LegalConsentPurpose.MARKETING,
        OR: [
          ...(userId ? [{ userId }] : []),
          ...(email
            ? [{ metadata: { path: ['email'], equals: email } }]
            : []),
        ],
      },
      orderBy: { occurredAt: 'desc' },
      select: { action: true },
    })
    return latest?.action === LegalConsentAction.GRANTED
  }

  async withdrawMarketingByToken(token: string): Promise<{ ok: boolean; message: string }> {
    const payload = this.verifyUnsubscribeToken(token)
    if (!payload) {
      return { ok: false, message: 'Invalid or expired unsubscribe link.' }
    }
    await this.ensureSeeded()
    const result = await this.recordConsent(
      {
        purpose: 'MARKETING',
        action: 'WITHDRAWN',
        locale: payload.locale || 'en',
        source: 'UNSUBSCRIBE_LINK',
        email: payload.email,
        metadata: { via: 'unsubscribe_link' },
      },
      payload.userId,
    )
    if (!result.recorded) {
      return { ok: false, message: 'Could not record withdrawal.' }
    }
    return { ok: true, message: 'Marketing consent withdrawn.' }
  }

  buildMarketingUnsubscribeToken(input: {
    userId?: string | null
    email?: string | null
    locale?: string
  }): string | null {
    const userId = input.userId?.trim() || undefined
    const email = input.email?.trim().toLowerCase() || undefined
    if (!userId && !email) return null
    const secret = this.unsubscribeSecret()
    const body = Buffer.from(
      JSON.stringify({
        userId,
        email,
        locale: input.locale || 'en',
        exp: Date.now() + 1000 * 60 * 60 * 24 * 365,
      }),
      'utf8',
    ).toString('base64url')
    const sig = createHash('sha256').update(`${body}.${secret}`).digest('base64url')
    return `${body}.${sig}`
  }

  /**
   * Absolute unsubscribe URL for marketing emails (one-click, no login).
   * Callers must also gate sends with `hasActiveMarketingConsent`.
   */
  buildMarketingUnsubscribeUrl(input: {
    shopPublicBaseUrl: string
    userId?: string | null
    email?: string | null
    locale?: string
  }): string | null {
    const token = this.buildMarketingUnsubscribeToken(input)
    if (!token) return null
    const base = input.shopPublicBaseUrl.replace(/\/$/, '')
    const locale = (input.locale || 'en').toLowerCase().slice(0, 2)
    return `${base}/${locale}/marketing/unsubscribe?token=${encodeURIComponent(token)}`
  }

  private verifyUnsubscribeToken(
    token: string,
  ): { userId?: string; email?: string; locale?: string } | null {
    const [body, sig] = token.split('.')
    if (!body || !sig) return null
    const expected = createHash('sha256')
      .update(`${body}.${this.unsubscribeSecret()}`)
      .digest('base64url')
    if (expected !== sig) return null
    try {
      const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
        userId?: string
        email?: string
        locale?: string
        exp?: number
      }
      if (parsed.exp && Date.now() > parsed.exp) return null
      return {
        userId: parsed.userId,
        email: parsed.email?.toLowerCase(),
        locale: parsed.locale,
      }
    } catch {
      return null
    }
  }

  private unsubscribeSecret(): string {
    return (
      process.env.MARKETING_UNSUBSCRIBE_SECRET?.trim() ||
      process.env.JWT_SECRET?.trim() ||
      'dev-marketing-unsubscribe'
    )
  }

  private async syncMarketingUserFlags(input: {
    userId: string | null
    email: string | null
    action: LegalConsentAction
  }) {
    const granted = input.action === LegalConsentAction.GRANTED
    const data = granted
      ? { newsletter: true, optin: true, marketingConsentAt: new Date() }
      : { newsletter: false, optin: false, marketingConsentAt: null as Date | null }

    if (input.userId) {
      await this.prisma.user.update({ where: { id: input.userId }, data }).catch(() => null)
      return
    }
    if (input.email) {
      await this.prisma.user
        .updateMany({
          where: { email: { equals: input.email, mode: 'insensitive' } },
          data,
        })
        .catch(() => null)
    }
  }

  private async findPublished(
    type: LegalDocumentType,
    locale: string,
  ): Promise<LegalPublicDocument | null> {
    const row = await this.findPublishedRow(type, locale)
    if (!row) return null
    const { seller, supportEmail } = await this.getSellerContext()
    const vars = sellerPlaceholderVars(seller, supportEmail)
    return {
      id: row.documentId,
      type,
      revisionId: row.id,
      locale: row.locale,
      version: row.version,
      title: interpolateLegalText(row.title, vars),
      intro: interpolateLegalText(row.intro, vars),
      sections: this.parseContent(row.content).map((section) => ({
        heading: interpolateLegalText(section.heading, vars),
        body: section.body.map((paragraph) => interpolateLegalText(paragraph, vars)),
      })),
      contentHash: row.contentHash,
      effectiveAt: row.effectiveAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      seller,
    }
  }

  private async findPublishedRow(type: LegalDocumentType, locale: string) {
    const chain = LOCALE_FALLBACKS[locale] ?? [locale, 'en', 'sk', 'uk']
    const document = await this.prisma.legalDocument.findUnique({ where: { type } })
    if (!document) return null
    for (const candidate of chain) {
      const row = await this.prisma.legalDocumentRevision.findFirst({
        where: {
          documentId: document.id,
          locale: candidate,
          status: LegalRevisionStatus.PUBLISHED,
        },
        orderBy: { version: 'desc' },
        include: { document: true },
      })
      if (row) return row
    }
    return null
  }

  private mapRevision(revision: {
    id: string
    documentId: string
    locale: string
    version: number
    title: string
    intro: string
    content: string
    contentHash: string
    status: LegalRevisionStatus
    effectiveAt: Date
    publishedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }) {
    return {
      id: revision.id,
      documentId: revision.documentId,
      locale: revision.locale,
      version: revision.version,
      title: revision.title,
      intro: revision.intro,
      sections: this.parseContent(revision.content),
      contentHash: revision.contentHash,
      status: revision.status,
      effectiveAt: revision.effectiveAt.toISOString(),
      publishedAt: revision.publishedAt?.toISOString() ?? null,
      createdAt: revision.createdAt.toISOString(),
      updatedAt: revision.updatedAt.toISOString(),
    }
  }

  private async getSellerContext(): Promise<{
    seller: LegalSellerIdentity
    supportEmail: string
  }> {
    try {
      const [cart, store] = await Promise.all([
        this.settings.getCartCheckoutSettings(),
        this.settings.getStoreContactSettings(),
      ])
      return {
        seller: resolveLegalSeller(cart, store),
        supportEmail: resolveSupportEmail(store),
      }
    } catch (error) {
      this.logger.warn(
        `Seller identity unavailable: ${error instanceof Error ? error.message : String(error)}`,
      )
      return { seller: EMPTY_SELLER, supportEmail: '' }
    }
  }

  private async getSeller(): Promise<LegalSellerIdentity> {
    const { seller } = await this.getSellerContext()
    return seller
  }

  private parseContent(raw: string): LegalSeedSection[] {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const row = item as { heading?: unknown; body?: unknown }
          return {
            heading: typeof row.heading === 'string' ? row.heading : '',
            body: Array.isArray(row.body)
              ? row.body.filter((part): part is string => typeof part === 'string')
              : [],
          }
        })
        .filter((item) => item.heading && item.body.length)
    } catch {
      return []
    }
  }

  private hashContent(locale: string, title: string, intro: string, content: string) {
    return createHash('sha256').update(`${locale}\n${title}\n${intro}\n${content}`).digest('hex')
  }

  private normalizeLocale(value?: string) {
    const locale = value?.trim().toLowerCase() || 'uk'
    return locale.slice(0, 8)
  }

  private parseType(value: string): LegalDocumentType {
    const upper = value.trim().toUpperCase()
    if (!Object.values(LegalDocumentType).includes(upper as LegalDocumentType)) {
      throw new BadRequestException('Невідомий тип документа.')
    }
    return upper as LegalDocumentType
  }

  private async resolveDeployMarket(): Promise<MarketRegion> {
    const fromEnv = resolveDeployMarketFromEnv()
    if (fromEnv) return fromEnv
    try {
      const market = await this.settings.getMarketSettings()
      return resolveDeployMarketFromRegion(market.region)
    } catch {
      return 'ua'
    }
  }

  private async getMarketLegalSeed(): Promise<LegalSeedEntry[]> {
    if (!this.marketSeedPromise) {
      this.marketSeedPromise = this.resolveDeployMarket().then((market) => {
        const seed = getLegalSeedForMarket(market)
        this.logger.log(`Legal CMS seed profile: ${market.toUpperCase()} (${seed.length} revisions).`)
        return seed
      })
    }
    return this.marketSeedPromise
  }

  private async ensureSeeded() {
    if (!this.seedPromise) {
      this.seedPromise = this.seedIfEmpty()
        .then(() => this.seedMissingDocumentTypes())
        .then(() => this.upgradeSeedPlaceholders())
        .then(() => this.syncMarketLegalPageSeed())
        .catch((error) => {
          this.seedPromise = null
          throw error
        })
    }
    await this.seedPromise
  }

  private async seedIfEmpty() {
    const existing = await this.prisma.legalDocument.count()
    if (existing > 0) return

    const legalSeed = await this.getMarketLegalSeed()
    const now = new Date()
    const types = [...new Set(legalSeed.map((entry) => entry.type))] as LegalDocumentType[]
    try {
      await this.prisma.$transaction(async (tx) => {
        const documents = new Map<LegalDocumentType, string>()
        for (const type of types) {
          const created = await tx.legalDocument.create({ data: { type } })
          documents.set(type, created.id)
        }
        for (const entry of legalSeed) {
          const documentId = documents.get(entry.type as LegalDocumentType)
          if (!documentId) continue
          const content = JSON.stringify(entry.sections)
          await tx.legalDocumentRevision.create({
            data: {
              documentId,
              locale: entry.locale,
              version: 1,
              title: entry.title,
              intro: entry.intro,
              content,
              contentHash: this.hashContent(entry.locale, entry.title, entry.intro, content),
              status: LegalRevisionStatus.PUBLISHED,
              publishedAt: now,
              effectiveAt: now,
            },
          })
        }
      })
      this.logger.log('Seeded legal document revisions v1.')
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return
      }
      throw error
    }
  }

  /** Add newly introduced document types (e.g. MARKETING_CONSENT) on existing DBs. */
  private async seedMissingDocumentTypes() {
    const legalSeed = await this.getMarketLegalSeed()
    const now = new Date()
    const byType = new Map<LegalDocumentType, LegalSeedEntry[]>()
    for (const entry of legalSeed) {
      const type = entry.type as LegalDocumentType
      const list = byType.get(type) ?? []
      list.push(entry)
      byType.set(type, list)
    }
    for (const [type, entries] of byType) {
      const existing = await this.prisma.legalDocument.findUnique({ where: { type } })
      if (existing) continue
      try {
        await this.prisma.$transaction(async (tx) => {
          const created = await tx.legalDocument.create({ data: { type } })
          for (const entry of entries) {
            const content = JSON.stringify(entry.sections)
            await tx.legalDocumentRevision.create({
              data: {
                documentId: created.id,
                locale: entry.locale,
                version: 1,
                title: entry.title,
                intro: entry.intro,
                content,
                contentHash: this.hashContent(entry.locale, entry.title, entry.intro, content),
                status: LegalRevisionStatus.PUBLISHED,
                publishedAt: now,
                effectiveAt: now,
              },
            })
          }
        })
        this.logger.log(`Seeded missing legal document type ${type}.`)
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue
        }
        throw error
      }
    }
  }

  /** One-time: replace early v1 templates that had no {ico} placeholders. */
  private async upgradeSeedPlaceholders() {
    const legalSeed = await this.getMarketLegalSeed()
    const now = new Date()
    for (const entry of legalSeed) {
      const usesPlaceholders =
        entry.intro.includes('{ico}') || JSON.stringify(entry.sections).includes('{ico}')
      if (!usesPlaceholders) continue
      const document = await this.prisma.legalDocument.findUnique({
        where: { type: entry.type as LegalDocumentType },
      })
      if (!document) continue
      const published = await this.prisma.legalDocumentRevision.findFirst({
        where: {
          documentId: document.id,
          locale: entry.locale,
          status: LegalRevisionStatus.PUBLISHED,
        },
        orderBy: { version: 'desc' },
      })
      if (!published || published.version !== 1) continue
      if (published.intro.includes('{ico}') || published.content.includes('{ico}')) continue

      const content = JSON.stringify(entry.sections)
      await this.prisma.$transaction(async (tx) => {
        await tx.legalDocumentRevision.update({
          where: { id: published.id },
          data: { status: LegalRevisionStatus.ARCHIVED },
        })
        await tx.legalDocumentRevision.create({
          data: {
            documentId: document.id,
            locale: entry.locale,
            version: 2,
            title: entry.title,
            intro: entry.intro,
            content,
            contentHash: this.hashContent(entry.locale, entry.title, entry.intro, content),
            status: LegalRevisionStatus.PUBLISHED,
            publishedAt: now,
            effectiveAt: now,
          },
        })
      })
      this.logger.log(`Upgraded ${entry.type}/${entry.locale} legal seed to v2 with seller placeholders.`)
    }
  }

  /** Overwrite v1 (or create missing locales) with deploy-market legal page copy. */
  private async syncMarketLegalPageSeed() {
    const legalSeed = await this.getMarketLegalSeed()
    const now = new Date()

    for (const entry of legalSeed) {
      const type = entry.type as LegalDocumentType
      const document = await this.prisma.legalDocument.findUnique({ where: { type } })
      if (!document) continue

      const content = JSON.stringify(entry.sections)
      const contentHash = this.hashContent(entry.locale, entry.title, entry.intro, content)

      const existing = await this.prisma.legalDocumentRevision.findFirst({
        where: {
          documentId: document.id,
          locale: entry.locale,
          version: 1,
        },
      })

      if (existing) {
        if (existing.contentHash === contentHash) continue
        await this.prisma.legalDocumentRevision.update({
          where: { id: existing.id },
          data: {
            title: entry.title,
            intro: entry.intro,
            content,
            contentHash,
            status: LegalRevisionStatus.PUBLISHED,
            publishedAt: existing.publishedAt ?? now,
            effectiveAt: existing.effectiveAt ?? now,
          },
        })
        this.logger.log(`Synced ${entry.type}/${entry.locale} v1 page content.`)
        continue
      }

      await this.prisma.legalDocumentRevision.create({
        data: {
          documentId: document.id,
          locale: entry.locale,
          version: 1,
          title: entry.title,
          intro: entry.intro,
          content,
          contentHash,
          status: LegalRevisionStatus.PUBLISHED,
          publishedAt: now,
          effectiveAt: now,
        },
      })
      this.logger.log(`Created ${entry.type}/${entry.locale} v1 page content.`)
    }
  }
}
