import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  CommunicationAudience,
  CommunicationSource,
  CommunicationStatus,
  CommunicationType,
  Prisma,
  ReviewRequestEventType,
  ReviewStatus,
  ReviewVerificationType,
} from '@prisma/client'

import { resolveOtpRateLimitPeerIp } from '../auth/otp.service'
import { resolveShopPublicOrigin } from '../mail/country-hosts'
import { MailService } from '../mail/mail.service'
import {
  customerReviewRequestAutoAttemptIdempotencyKey,
  customerReviewRequestIdempotencyKey,
} from '../orders/order-communication.constants'
import { PrismaService } from '../prisma/prisma.service'
import { QueueService } from '../queue/queue.service'
import { RedisService } from '../redis/redis.service'
import { SettingsService } from '../settings/settings.service'
import {
  resolveReviewRequestTemplate,
  type ReviewsSettings,
} from '../settings/reviews.types'
import type {
  SubmitOrderReviewByTokenDto,
  TokenProductReviewDto,
} from './dto/submit-order-review-by-token.dto'
import {
  computeReviewRequestDelayMs,
  evaluateAutomaticReviewEligibility,
  expectedAutomaticSendAt,
  shouldAutoRegenerateToken,
  type AutoReviewSkipReason,
} from './review-request-auto'
import { collectPurchasedVariantLabels, REVIEW_EXCLUDED_PAYMENT_STATUS } from './review-verification'
import {
  fillReviewRequestTemplate,
  reviewRequestTemplateToHtml,
  sampleReviewRequestVars,
} from './review-request-template'
import {
  buildReviewRequestAbsoluteUrl,
  decryptReviewRequestToken,
  encryptReviewRequestToken,
  generateReviewRequestRawToken,
  hashReviewRequestToken,
  reviewRequestExpiresAt,
} from './review-request-token'

const RATE_WINDOW_SEC = 60
const RATE_GET_MAX = 60
const RATE_POST_MAX = 20

export type ReviewRequestProductDto = {
  productId: string
  productName: string
  productSlug: string | null
  imageUrl: string | null
  purchasedVariantLabels: string[]
  alreadyReviewed: boolean
  existingRating: number | null
}

export type ReviewRequestResolveDto = {
  orderNumber: string
  locale: string
  authorNameDefault: string
  store: {
    alreadyReviewed: boolean
    existingRating: number | null
  }
  products: ReviewRequestProductDto[]
  completedAt: string | null
  expiresAt: string
}

export type ReviewRequestSubmitResult = {
  createdStore: boolean
  createdProductIds: string[]
  skippedStore: boolean
  skippedProductIds: string[]
  completedAt: string | null
  fullyCompleted: boolean
}

export type ReviewRequestDerivedStatus =
  | 'NOT_CREATED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'REVOKED'

export type ReviewRequestBackstageStatus = {
  exists: boolean
  featureEnabled: boolean
  automaticSendingEnabled: boolean
  derivedStatus: ReviewRequestDerivedStatus
  createdAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  completedAt: string | null
  sentAt: string | null
  scheduledFor: string | null
  lastOpenedAt: string | null
  lastGeneratedAt: string | null
  locale: string | null
  storeReviewed: boolean
  productsReviewed: number
  productsTotal: number
  customerEmail: string | null
  /** Raw URL is never recoverable from hash — only returned from generate/regenerate/send. */
  rawUrlAvailable: false
  canSend: boolean
  requiresRegenerateToSend: boolean
  /** Calculated from shippedAt + delayDays — not proof a BullMQ job exists. */
  expectedAutomaticSendAt: string | null
  events: Array<{
    id: string
    type: ReviewRequestEventType
    createdByUserId: string | null
    createdAt: string
  }>
  /** Latest FAILED CUSTOMER_REVIEW_REQUEST row (auto or manual), if any. */
  latestFailedCommunication: {
    id: string
    status: CommunicationStatus
    source: CommunicationSource
    errorMessage: string | null
    createdAt: string
    sentAt: string | null
  } | null
}

export type ReviewRequestGenerateResult = {
  reviewUrl: string
  expiresAt: string
  locale: string
  regenerated: boolean
}

export type ReviewRequestEmailPreview = {
  locale: string
  toEmail: string | null
  subject: string
  bodyText: string
  bodyHtml: string
  reviewUrl: string
  reviewUrlIsPlaceholder: boolean
}

export type ReviewRequestSendResult = {
  communication: {
    id: string
    status: CommunicationStatus
    toEmail: string | null
    subjectSnapshot: string | null
    bodySnapshot: string | null
    locale: string | null
    providerMessageId: string | null
    errorMessage: string | null
    sentAt: string | null
    createdAt: string
    source: CommunicationSource
    type: CommunicationType
  }
  reviewUrl: string | null
  regenerated: boolean
  requestSentAt: string | null
}

@Injectable()
export class ReviewRequestService {
  private readonly logger = new Logger(ReviewRequestService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
    private readonly queue: QueueService,
  ) {}

  private formatOrderNumber(orderNumber: number): string {
    return `ZY-${String(orderNumber).padStart(8, '0')}`
  }

  private resolveLocale(orderLocale: string | null | undefined): string {
    const locale = orderLocale?.trim().toLowerCase()
    if (locale) return locale
    return 'sk'
  }

  private authorNameFromOrder(order: {
    customerFirstName: string
    customerLastName: string
  }): string {
    return `${order.customerFirstName} ${order.customerLastName}`.replace(/\s+/g, ' ').trim()
  }

  private isOrderBlocked(order: { status: string; paymentStatus: string | null }): boolean {
    return order.status === 'CANCELLED' || order.paymentStatus === REVIEW_EXCLUDED_PAYMENT_STATUS
  }

  private shopOrigin(countrySiteCode: string | null | undefined): string {
    return resolveShopPublicOrigin({
      countrySiteCode,
      countryHostsEnv: this.config.get<string>('GA_COUNTRY_HOSTS'),
      shopPublicUrl: this.config.get<string>('SHOP_PUBLIC_URL'),
      corsOrigin: this.config.get<string>('CORS_ORIGIN'),
    })
  }

  private async hitRateLimit(key: string, max: number): Promise<boolean> {
    const count = await this.redis.client.incr(key)
    if (count === 1) {
      await this.redis.client.expire(key, RATE_WINDOW_SEC)
    }
    return count > max
  }

  private async assertRateLimit(kind: 'get' | 'post', remoteAddress: string | undefined) {
    const ip = resolveOtpRateLimitPeerIp(remoteAddress) ?? 'unknown'
    const key = `review-request:rl:${kind}:${ip}`
    const max = kind === 'get' ? RATE_GET_MAX : RATE_POST_MAX
    if (await this.hitRateLimit(key, max)) {
      throw new BadRequestException('Забагато запитів. Спробуйте пізніше.')
    }
  }

  private async assertFeatureEnabled(settings?: ReviewsSettings) {
    const reviews = settings ?? (await this.settings.getReviewsSettings())
    if (!reviews.postPurchaseRequestsEnabled) {
      throw new GoneException('Запит відгуку недоступний.')
    }
    return reviews
  }

  private async mintTokenMaterial(locale: string, countrySiteCode: string | null) {
    const reviews = await this.settings.getReviewsSettings()
    const rawToken = generateReviewRequestRawToken()
    const tokenHash = hashReviewRequestToken(rawToken)
    const tokenEncrypted = encryptReviewRequestToken(rawToken)
    const expiresAt = reviewRequestExpiresAt(new Date(), reviews.tokenValidityDays)
    const reviewUrl = buildReviewRequestAbsoluteUrl(
      this.shopOrigin(countrySiteCode),
      locale,
      rawToken,
    )
    return { rawToken, tokenHash, tokenEncrypted, expiresAt, reviewUrl }
  }

  private resolveStoredReviewUrl(
    tokenEncrypted: string | null | undefined,
    locale: string,
    countrySiteCode: string | null,
  ): string | null {
    const raw = decryptReviewRequestToken(tokenEncrypted)
    if (!raw) return null
    return buildReviewRequestAbsoluteUrl(this.shopOrigin(countrySiteCode), locale, raw)
  }

  private deriveStatus(row: {
    revokedAt: Date | null
    expiresAt: Date
    completedAt: Date | null
  } | null): ReviewRequestDerivedStatus {
    if (!row) return 'NOT_CREATED'
    if (row.revokedAt) return 'REVOKED'
    if (row.expiresAt.getTime() <= Date.now()) return 'EXPIRED'
    if (row.completedAt) return 'COMPLETED'
    return 'ACTIVE'
  }

  private placeholderReviewUrl(locale: string, countrySiteCode: string | null): string {
    return `${this.shopOrigin(countrySiteCode).replace(/\/$/, '')}/${locale}/reviews/request/PREVIEW-ONLY-PLACEHOLDER`
  }

  async generateForOrder(
    orderId: string,
    staffUserId: string,
  ): Promise<ReviewRequestGenerateResult> {
    await this.assertFeatureEnabled()
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        locale: true,
        countrySiteCode: true,
        reviewRequest: { select: { id: true } },
      },
    })
    if (!order) throw new NotFoundException('Замовлення не знайдено.')
    if (this.isOrderBlocked(order)) {
      throw new BadRequestException('Для скасованого або відшкодованого замовлення не можна створити запит відгуку.')
    }

    if (order.reviewRequest) {
      throw new ConflictException(
        'Запит відгуку вже існує. Скористайтеся regenerate, щоб отримати нове посилання.',
      )
    }

    const locale = this.resolveLocale(order.locale)
    const minted = await this.mintTokenMaterial(locale, order.countrySiteCode)
    const now = new Date()

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.reviewRequest.create({
        data: {
          orderId: order.id,
          tokenHash: minted.tokenHash,
          tokenEncrypted: minted.tokenEncrypted,
          expiresAt: minted.expiresAt,
          locale,
          createdByUserId: staffUserId,
          lastGeneratedAt: now,
        },
      })
      await tx.reviewRequestEvent.create({
        data: {
          reviewRequestId: row.id,
          type: ReviewRequestEventType.GENERATED,
          createdByUserId: staffUserId,
        },
      })
    })

    this.logger.log(`ReviewRequest created for order ${order.id} by staff ${staffUserId}`)

    return {
      reviewUrl: minted.reviewUrl,
      expiresAt: minted.expiresAt.toISOString(),
      locale,
      regenerated: false,
    }
  }

  async regenerateForOrder(
    orderId: string,
    staffUserId: string,
  ): Promise<ReviewRequestGenerateResult> {
    await this.assertFeatureEnabled()
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        locale: true,
        countrySiteCode: true,
        reviewRequest: { select: { id: true } },
      },
    })
    if (!order) throw new NotFoundException('Замовлення не знайдено.')
    if (this.isOrderBlocked(order)) {
      throw new BadRequestException('Для скасованого або відшкодованого замовлення не можна оновити запит відгуку.')
    }
    if (!order.reviewRequest) {
      throw new NotFoundException('Запит відгуку ще не створено. Спочатку generate.')
    }

    const locale = this.resolveLocale(order.locale)
    const minted = await this.mintTokenMaterial(locale, order.countrySiteCode)
    const now = new Date()

    await this.prisma.$transaction(async (tx) => {
      await tx.reviewRequest.update({
        where: { id: order.reviewRequest!.id },
        data: {
          tokenHash: minted.tokenHash,
          tokenEncrypted: minted.tokenEncrypted,
          expiresAt: minted.expiresAt,
          revokedAt: null,
          revokedByUserId: null,
          completedAt: null,
          locale,
          lastGeneratedAt: now,
        },
      })
      await tx.reviewRequestEvent.create({
        data: {
          reviewRequestId: order.reviewRequest!.id,
          type: ReviewRequestEventType.REGENERATED,
          createdByUserId: staffUserId,
        },
      })
    })

    this.logger.log(`ReviewRequest regenerated for order ${order.id} by staff ${staffUserId}`)

    return {
      reviewUrl: minted.reviewUrl,
      expiresAt: minted.expiresAt.toISOString(),
      locale,
      regenerated: true,
    }
  }

  async revokeForOrder(orderId: string, staffUserId: string): Promise<{ revoked: true }> {
    const existing = await this.prisma.reviewRequest.findUnique({
      where: { orderId },
      select: { id: true, revokedAt: true },
    })
    if (!existing) throw new NotFoundException('Запит відгуку не знайдено.')
    if (existing.revokedAt) return { revoked: true }

    await this.prisma.$transaction(async (tx) => {
      await tx.reviewRequest.update({
        where: { id: existing.id },
        data: {
          revokedAt: new Date(),
          revokedByUserId: staffUserId,
        },
      })
      await tx.reviewRequestEvent.create({
        data: {
          reviewRequestId: existing.id,
          type: ReviewRequestEventType.REVOKED,
          createdByUserId: staffUserId,
        },
      })
    })
    this.logger.log(`ReviewRequest revoked for order ${orderId} by staff ${staffUserId}`)
    return { revoked: true }
  }

  /**
   * Schedule delayed automatic review-request email after transition → SHIPPED.
   * Does NOT create ReviewRequest / token — mint happens at job execution.
   */
  async scheduleAutomaticAfterShipped(orderId: string): Promise<void> {
    const reviews = await this.settings.getReviewsSettings()
    if (!reviews.postPurchaseRequestsEnabled) {
      this.logger.debug(
        `customer-review-request schedule skip orderId=${orderId} outcome=skip_feature_disabled`,
      )
      return
    }
    if (!reviews.automaticSendingEnabled) {
      this.logger.debug(
        `customer-review-request schedule skip orderId=${orderId} outcome=skip_auto_disabled`,
      )
      return
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        shippedAt: true,
        customerEmail: true,
        paymentStatus: true,
      },
    })
    if (!order || order.status !== 'SHIPPED') return
    if (!order.customerEmail?.trim()) {
      this.logger.log(
        `customer-review-request schedule skip orderId=${orderId} outcome=skip_no_email`,
      )
      return
    }
    if (order.paymentStatus === REVIEW_EXCLUDED_PAYMENT_STATUS) {
      this.logger.log(
        `customer-review-request schedule skip orderId=${orderId} outcome=skip_refunded`,
      )
      return
    }
    if (!order.shippedAt) {
      this.logger.warn(
        `customer-review-request schedule skip orderId=${orderId} outcome=missing_shippedAt`,
      )
      return
    }

    const delayMs = computeReviewRequestDelayMs(order.shippedAt, reviews.delayDays)
    const job = await this.queue.enqueueCustomerReviewRequest({ orderId, delayMs })
    this.logger.log(
      `customer-review-request schedule orderId=${orderId} jobId=${job.id} delayMs=${delayMs}`,
    )
  }

  /**
   * BullMQ worker: re-check eligibility, mint/rotate token, send via Phase 3 mail path.
   * On provider failure throws so BullMQ retries; each retry may rotate token again
   * (raw token not recoverable after prior attempt) and writes a NEW Communication row
   * keyed by attempt number — FAILED rows are never mutated to SENT.
   */
  async processAutomaticSend(
    orderId: string,
    opts?: { attempt?: number },
  ): Promise<{ outcome: AutoReviewSkipReason }> {
    const attempt =
      typeof opts?.attempt === 'number' && Number.isFinite(opts.attempt) && opts.attempt >= 1
        ? Math.floor(opts.attempt)
        : 1
    const reviews = await this.settings.getReviewsSettings()
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        customerEmail: true,
        locale: true,
        countrySiteCode: true,
        customerFirstName: true,
        customerLastName: true,
        userId: true,
      },
    })
    const reviewRequest = await this.prisma.reviewRequest.findUnique({
      where: { orderId },
      select: {
        id: true,
        sentAt: true,
        completedAt: true,
        revokedAt: true,
        expiresAt: true,
        locale: true,
      },
    })

    const successful = await this.prisma.communication.findFirst({
      where: {
        orderId,
        type: CommunicationType.CUSTOMER_REVIEW_REQUEST,
        status: CommunicationStatus.SENT,
      },
      select: { id: true },
    })

    const eligibility = evaluateAutomaticReviewEligibility({
      postPurchaseRequestsEnabled: reviews.postPurchaseRequestsEnabled,
      automaticSendingEnabled: reviews.automaticSendingEnabled,
      order,
      reviewRequest,
      hasSuccessfulReviewEmail: !!successful,
    })
    if (!eligibility.ok) {
      this.logger.log(
        `customer-review-request process orderId=${orderId} outcome=${eligibility.reason}`,
      )
      return { outcome: eligibility.reason }
    }

    const tokenAction = shouldAutoRegenerateToken(reviewRequest)
    if (tokenAction === 'noop_revoked') {
      this.logger.log(`customer-review-request process orderId=${orderId} outcome=skip_revoked`)
      return { outcome: 'skip_revoked' }
    }
    if (tokenAction === 'noop_completed') {
      this.logger.log(`customer-review-request process orderId=${orderId} outcome=skip_completed`)
      return { outcome: 'skip_completed' }
    }
    if (tokenAction === 'noop_sent') {
      this.logger.log(`customer-review-request process orderId=${orderId} outcome=skip_already_sent`)
      return { outcome: 'skip_already_sent' }
    }

    const minted = await this.mintTokenForAutomaticSend(orderId, order!, reviews)
    const freshRequest = await this.prisma.reviewRequest.findUnique({
      where: { orderId },
      select: { id: true, locale: true, sentAt: true },
    })
    if (!freshRequest) {
      this.logger.warn(`customer-review-request process orderId=${orderId} outcome=skip_order_missing`)
      return { outcome: 'skip_order_missing' }
    }

    const locale = this.resolveLocale(freshRequest.locale ?? order!.locale)
    const to = order!.customerEmail!.trim()

    try {
      const result = await this.deliverReviewRequestEmail({
        order: order!,
        to,
        locale,
        reviewUrl: minted.reviewUrl,
        regenerated: tokenAction === 'regenerate',
        source: CommunicationSource.AUTOMATIC,
        createdByUserId: null,
        idempotencyKey: customerReviewRequestAutoAttemptIdempotencyKey(orderId, attempt),
        requestId: freshRequest.id,
        requestSentAt: freshRequest.sentAt,
        reviews,
      })
      if (
        result.communication.status === CommunicationStatus.SENT ||
        result.communication.status === CommunicationStatus.SKIPPED
      ) {
        this.logger.log(
          `customer-review-request process orderId=${orderId} attempt=${attempt} outcome=sent communicationId=${result.communication.id}`,
        )
        return { outcome: 'sent' }
      }
      this.logger.warn(
        `customer-review-request process orderId=${orderId} attempt=${attempt} outcome=failed communicationId=${result.communication.id}`,
      )
      throw new Error(`Automatic review request send failed for order ${orderId}`)
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        this.logger.warn(
          `customer-review-request process orderId=${orderId} attempt=${attempt} outcome=failed err=${err.message}`,
        )
        throw err
      }
      throw err
    }
  }

  /**
   * System mint/rotate immediately before automatic send.
   * Never un-revokes. Never touches completed / already-sent rows.
   */
  private async mintTokenForAutomaticSend(
    orderId: string,
    order: { locale: string | null; countrySiteCode: string | null },
    _reviews: ReviewsSettings,
  ): Promise<{ reviewUrl: string; locale: string }> {
    const existing = await this.prisma.reviewRequest.findUnique({
      where: { orderId },
      select: {
        id: true,
        locale: true,
        sentAt: true,
        completedAt: true,
        revokedAt: true,
        tokenEncrypted: true,
      },
    })
    if (existing?.revokedAt) throw new BadRequestException('revoked')
    if (existing?.completedAt) throw new BadRequestException('completed')
    if (existing?.sentAt) throw new BadRequestException('already_sent')

    const locale = this.resolveLocale(existing?.locale ?? order.locale)

    // Reuse stable encrypted token when present (no rotation on auto-send).
    if (existing?.tokenEncrypted) {
      const reused = this.resolveStoredReviewUrl(
        existing.tokenEncrypted,
        locale,
        order.countrySiteCode,
      )
      if (reused) return { reviewUrl: reused, locale }
    }

    const minted = await this.mintTokenMaterial(locale, order.countrySiteCode)
    const now = new Date()
    const eventType = existing
      ? ReviewRequestEventType.REGENERATED
      : ReviewRequestEventType.GENERATED

    await this.prisma.$transaction(async (tx) => {
      const row = existing
        ? await tx.reviewRequest.update({
            where: { id: existing.id },
            data: {
              tokenHash: minted.tokenHash,
              tokenEncrypted: minted.tokenEncrypted,
              expiresAt: minted.expiresAt,
              locale,
              lastGeneratedAt: now,
            },
          })
        : await tx.reviewRequest.create({
            data: {
              orderId,
              tokenHash: minted.tokenHash,
              tokenEncrypted: minted.tokenEncrypted,
              expiresAt: minted.expiresAt,
              locale,
              createdByUserId: null,
              lastGeneratedAt: now,
            },
          })
      await tx.reviewRequestEvent.create({
        data: {
          reviewRequestId: row.id,
          type: eventType,
          createdByUserId: null,
        },
      })
    })

    return { reviewUrl: minted.reviewUrl, locale }
  }

  async getBackstageStatus(orderId: string): Promise<ReviewRequestBackstageStatus> {
    const reviews = await this.settings.getReviewsSettings()
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        customerEmail: true,
        locale: true,
        shippedAt: true,
        reviewRequest: {
          select: {
            createdAt: true,
            expiresAt: true,
            revokedAt: true,
            completedAt: true,
            sentAt: true,
            scheduledFor: true,
            lastOpenedAt: true,
            lastGeneratedAt: true,
            locale: true,
            tokenEncrypted: true,
            events: {
              orderBy: { createdAt: 'desc' },
              take: 50,
              select: {
                id: true,
                type: true,
                createdByUserId: true,
                createdAt: true,
              },
            },
          },
        },
        items: {
          select: {
            productVariantId: true,
            productVariant: { select: { productId: true } },
          },
        },
        reviews: {
          select: { productId: true },
        },
      },
    })
    if (!order) throw new NotFoundException('Замовлення не знайдено.')

    const productIds = new Set<string>()
    for (const item of order.items) {
      const productId = item.productVariantId ? item.productVariant?.productId : null
      if (productId) productIds.add(productId)
    }
    const storeReviewed = order.reviews.some((r) => r.productId == null)
    const reviewedProductIds = new Set(
      order.reviews.map((r) => r.productId).filter((id): id is string => Boolean(id)),
    )
    const productsReviewed = [...productIds].filter((id) => reviewedProductIds.has(id)).length
    const row = order.reviewRequest
    const derivedStatus = this.deriveStatus(row)
    const blocked = this.isOrderBlocked(order)
    const hasEmail = Boolean(order.customerEmail?.trim())
    const inactive =
      derivedStatus === 'REVOKED' ||
      derivedStatus === 'EXPIRED' ||
      derivedStatus === 'COMPLETED'
    const canSend =
      reviews.postPurchaseRequestsEnabled && !blocked && hasEmail && !inactive
    // Legacy rows without ciphertext still need a one-time rotate before send.
    const requiresRegenerateToSend = Boolean(row) && !row?.tokenEncrypted && !inactive
    const expectedAt = expectedAutomaticSendAt(order.shippedAt, reviews.delayDays)

    const latestFailed = await this.prisma.communication.findFirst({
      where: {
        orderId,
        type: CommunicationType.CUSTOMER_REVIEW_REQUEST,
        status: CommunicationStatus.FAILED,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        source: true,
        errorMessage: true,
        createdAt: true,
        sentAt: true,
      },
    })

    return {
      exists: Boolean(row),
      featureEnabled: reviews.postPurchaseRequestsEnabled,
      automaticSendingEnabled: reviews.automaticSendingEnabled,
      derivedStatus,
      createdAt: row?.createdAt.toISOString() ?? null,
      expiresAt: row?.expiresAt.toISOString() ?? null,
      revokedAt: row?.revokedAt?.toISOString() ?? null,
      completedAt: row?.completedAt?.toISOString() ?? null,
      sentAt: row?.sentAt?.toISOString() ?? null,
      scheduledFor: row?.scheduledFor?.toISOString() ?? null,
      lastOpenedAt: row?.lastOpenedAt?.toISOString() ?? null,
      lastGeneratedAt: row?.lastGeneratedAt?.toISOString() ?? null,
      locale: row?.locale ?? this.resolveLocale(order.locale),
      storeReviewed,
      productsReviewed,
      productsTotal: productIds.size,
      customerEmail: order.customerEmail?.trim() || null,
      rawUrlAvailable: false,
      canSend,
      requiresRegenerateToSend,
      expectedAutomaticSendAt: expectedAt?.toISOString() ?? null,
      events: (row?.events ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        createdByUserId: e.createdByUserId,
        createdAt: e.createdAt.toISOString(),
      })),
      latestFailedCommunication: latestFailed
        ? {
            id: latestFailed.id,
            status: latestFailed.status,
            source: latestFailed.source,
            errorMessage: latestFailed.errorMessage,
            createdAt: latestFailed.createdAt.toISOString(),
            sentAt: latestFailed.sentAt?.toISOString() ?? null,
          }
        : null,
    }
  }

  private async loadValidRequest(rawToken: string) {
    const tokenHash = hashReviewRequestToken(rawToken.trim())
    const request = await this.prisma.reviewRequest.findUnique({
      where: { tokenHash },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            locale: true,
            userId: true,
            customerFirstName: true,
            customerLastName: true,
            customerEmail: true,
            customerPhone: true,
            items: {
              select: {
                productName: true,
                productSlug: true,
                variantLabel: true,
                productVariantId: true,
                productVariant: {
                  select: {
                    productId: true,
                    product: {
                      select: {
                        id: true,
                        slug: true,
                        isPublished: true,
                        images: {
                          orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }],
                          take: 1,
                          select: { url: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!request) {
      throw new UnauthorizedException('Недійсне або застаріле посилання для відгуку.')
    }
    if (request.revokedAt) {
      throw new GoneException('Посилання для відгуку відкликано.')
    }
    if (request.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('Термін дії посилання для відгуку минув.')
    }
    if (request.completedAt) {
      throw new GoneException({
        statusCode: 410,
        message: 'Відгук за цим посиланням уже залишено.',
        code: 'REVIEW_REQUEST_COMPLETED',
      })
    }
    if (this.isOrderBlocked(request.order)) {
      throw new GoneException('Замовлення більше не доступне для відгуку.')
    }

    return request
  }

  private groupProducts(
    items: Array<{
      productName: string
      productSlug: string
      variantLabel: string | null
      productVariantId: string | null
      productVariant: {
        productId: string
        product: {
          id: string
          slug: string
          isPublished: boolean
          images: Array<{ url: string }>
        } | null
      } | null
    }>,
  ) {
    type Acc = {
      productId: string
      productName: string
      productSlug: string | null
      imageUrl: string | null
      labelRows: Array<{
        productVariantId: string | null
        matchesReviewedProduct: boolean
        variantLabel: string | null
      }>
    }
    const map = new Map<string, Acc>()

    for (const item of items) {
      const variant = item.productVariant
      const productId = variant?.productId
      if (!item.productVariantId || !productId || !variant) continue

      const published = Boolean(variant.product?.isPublished)
      const existing = map.get(productId)
      if (!existing) {
        map.set(productId, {
          productId,
          productName: item.productName,
          productSlug: published ? variant.product?.slug ?? item.productSlug : null,
          imageUrl: published ? variant.product?.images[0]?.url ?? null : null,
          labelRows: [
            {
              productVariantId: item.productVariantId,
              matchesReviewedProduct: true,
              variantLabel: item.variantLabel,
            },
          ],
        })
      } else {
        existing.labelRows.push({
          productVariantId: item.productVariantId,
          matchesReviewedProduct: true,
          variantLabel: item.variantLabel,
        })
      }
    }

    return [...map.values()].map((row) => ({
      productId: row.productId,
      productName: row.productName,
      productSlug: row.productSlug,
      imageUrl: row.imageUrl,
      purchasedVariantLabels: collectPurchasedVariantLabels(row.labelRows),
    }))
  }

  async resolveByToken(
    rawToken: string,
    remoteAddress: string | undefined,
  ): Promise<ReviewRequestResolveDto> {
    await this.assertRateLimit('get', remoteAddress)
    await this.assertFeatureEnabled()
    const request = await this.loadValidRequest(rawToken)

    void this.prisma.reviewRequest
      .update({
        where: { id: request.id },
        data: { lastOpenedAt: new Date() },
      })
      .catch((err) => {
        this.logger.warn(
          `Failed to stamp lastOpenedAt for ReviewRequest ${request.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })

    const existingReviews = await this.prisma.review.findMany({
      where: { orderId: request.orderId },
      select: { productId: true, rating: true },
    })
    const storeReview = existingReviews.find((row) => row.productId == null) ?? null
    const productReviewById = new Map(
      existingReviews
        .filter((row) => row.productId != null)
        .map((row) => [row.productId as string, row.rating]),
    )

    const products = this.groupProducts(request.order.items).map((product) => {
      const rating = productReviewById.get(product.productId)
      return {
        ...product,
        alreadyReviewed: rating != null,
        existingRating: rating ?? null,
      }
    })

    return {
      orderNumber: this.formatOrderNumber(request.order.orderNumber),
      locale: this.resolveLocale(request.locale ?? request.order.locale),
      authorNameDefault: this.authorNameFromOrder(request.order),
      store: {
        alreadyReviewed: storeReview != null,
        existingRating: storeReview?.rating ?? null,
      },
      products,
      completedAt: request.completedAt?.toISOString() ?? null,
      expiresAt: request.expiresAt.toISOString(),
    }
  }

  async submitByToken(
    rawToken: string,
    dto: SubmitOrderReviewByTokenDto,
    remoteAddress: string | undefined,
  ): Promise<ReviewRequestSubmitResult> {
    await this.assertRateLimit('post', remoteAddress)
    await this.assertFeatureEnabled()

    const hasStore = Boolean(dto.store)
    const products = dto.products ?? []
    if (!hasStore && products.length === 0) {
      throw new BadRequestException('Додайте загальну оцінку замовлення або оцінки товарів.')
    }

    const request = await this.loadValidRequest(rawToken)
    const allowedProducts = this.groupProducts(request.order.items)
    const allowedIds = new Set(allowedProducts.map((p) => p.productId))
    const labelsByProduct = new Map(
      allowedProducts.map((p) => [p.productId, p.purchasedVariantLabels]),
    )

    for (const line of products) {
      if (!allowedIds.has(line.productId)) {
        throw new BadRequestException('Товар не належить до цього замовлення.')
      }
    }

    const uniqueProductLines: TokenProductReviewDto[] = []
    const seenProductIds = new Set<string>()
    for (const line of products) {
      if (seenProductIds.has(line.productId)) continue
      seenProductIds.add(line.productId)
      uniqueProductLines.push(line)
    }

    const authorName = dto.authorName.trim()
    const email = request.order.customerEmail?.trim().toLowerCase() || null
    const phone = request.order.customerPhone?.trim() || null
    if (!email && !phone) {
      throw new BadRequestException('У замовленні немає email або телефону для відгуку.')
    }

    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.reviewRequest.findUnique({
        where: { id: request.id },
        select: {
          id: true,
          orderId: true,
          expiresAt: true,
          revokedAt: true,
          completedAt: true,
          tokenHash: true,
        },
      })
      if (!fresh || fresh.tokenHash !== request.tokenHash) {
        throw new UnauthorizedException('Недійсне або застаріле посилання для відгуку.')
      }
      if (fresh.revokedAt || fresh.expiresAt.getTime() <= Date.now()) {
        throw new GoneException('Посилання для відгуку більше не дійсне.')
      }
      if (fresh.completedAt) {
        throw new GoneException({
          statusCode: 410,
          message: 'Відгук за цим посиланням уже залишено.',
          code: 'REVIEW_REQUEST_COMPLETED',
        })
      }

      const existing = await tx.review.findMany({
        where: { orderId: request.orderId },
        select: { productId: true },
      })
      const hasStoreReview = existing.some((row) => row.productId == null)
      const reviewedProductIds = new Set(
        existing.map((row) => row.productId).filter((id): id is string => Boolean(id)),
      )

      const pendingProductIds = allowedProducts
        .map((p) => p.productId)
        .filter((id) => !reviewedProductIds.has(id))
      const productLinesById = new Map(
        uniqueProductLines.map((line) => [line.productId, line]),
      )
      const allPendingRatedWithNotes =
        pendingProductIds.length > 0 &&
        pendingProductIds.every((id) => {
          const line = productLinesById.get(id)
          const note = line?.text?.trim() ?? ''
          return Boolean(line && line.rating >= 1 && note.length >= 10)
        })
      // Overall (store) is optional only when every remaining product has rating + note.
      const overallOptional =
        allowedProducts.length > 0 &&
        (pendingProductIds.length === 0 || allPendingRatedWithNotes)

      if (!overallOptional) {
        if (!hasStore && !hasStoreReview) {
          throw new BadRequestException(
            'Загальна оцінка замовлення з текстом обовʼязкова, або оцініть усі товари з примітками.',
          )
        }
        if (hasStore) {
          const storeText = dto.store!.text?.trim() ?? ''
          if (storeText.length < 10) {
            throw new BadRequestException(
              'Для загальної оцінки потрібен текст щонайменше з 10 символів.',
            )
          }
        }
      } else if (hasStore) {
        const storeText = dto.store!.text?.trim() ?? ''
        if (storeText.length > 0 && storeText.length < 10) {
          throw new BadRequestException(
            'Текст загальної оцінки має містити щонайменше 10 символів або залиште поле порожнім.',
          )
        }
      }

      let createdStore = false
      let skippedStore = false
      const createdProductIds: string[] = []
      const skippedProductIds: string[] = []

      if (hasStore) {
        if (hasStoreReview) {
          skippedStore = true
        } else {
          try {
            await tx.review.create({
              data: {
                userId: request.order.userId,
                productId: null,
                orderId: request.orderId,
                verificationType: ReviewVerificationType.VERIFIED_CUSTOMER,
                purchasedVariantLabels: [],
                authorName,
                email,
                phone,
                text: dto.store!.text?.trim() || '',
                rating: dto.store!.rating,
                status: ReviewStatus.PENDING,
              },
            })
            createdStore = true
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            ) {
              skippedStore = true
            } else {
              throw error
            }
          }
        }
      }

      for (const line of uniqueProductLines) {
        if (reviewedProductIds.has(line.productId)) {
          skippedProductIds.push(line.productId)
          continue
        }
        try {
          await tx.review.create({
            data: {
              userId: request.order.userId,
              productId: line.productId,
              orderId: request.orderId,
              verificationType: ReviewVerificationType.VERIFIED_PURCHASE,
              purchasedVariantLabels: labelsByProduct.get(line.productId) ?? [],
              authorName,
              email,
              phone,
              text: line.text?.trim() || '',
              rating: line.rating,
              status: ReviewStatus.PENDING,
            },
          })
          reviewedProductIds.add(line.productId)
          createdProductIds.push(line.productId)
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          ) {
            skippedProductIds.push(line.productId)
            continue
          }
          throw error
        }
      }

      const storeFinallyDone = hasStoreReview || createdStore
      const productsFinallyDone =
        allowedProducts.length === 0 ||
        allowedProducts.every((p) => reviewedProductIds.has(p.productId))
      // Close link when nothing left to rate:
      // - no products → store review required
      // - with products → every product reviewed (store may be skipped via products+notes path)
      const stampComplete =
        !fresh.completedAt &&
        ((allowedProducts.length === 0 && storeFinallyDone) ||
          (allowedProducts.length > 0 && productsFinallyDone))

      let completedAt: Date | null = null
      if (stampComplete) {
        const updated = await tx.reviewRequest.update({
          where: { id: request.id },
          data: { completedAt: new Date() },
          select: { completedAt: true },
        })
        completedAt = updated.completedAt
      }

      return {
        createdStore,
        createdProductIds,
        skippedStore,
        skippedProductIds,
        completedAt: completedAt?.toISOString() ?? null,
        fullyCompleted: Boolean(completedAt),
      }
    })
  }

  async previewEmailForOrder(
    orderId: string,
    localeOverride?: string,
  ): Promise<ReviewRequestEmailPreview> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        locale: true,
        countrySiteCode: true,
        customerEmail: true,
        customerFirstName: true,
        customerLastName: true,
        reviewRequest: { select: { locale: true, tokenEncrypted: true } },
      },
    })
    if (!order) throw new NotFoundException('Замовлення не знайдено.')

    const reviews = await this.settings.getReviewsSettings()
    const locale = this.resolveLocale(
      localeOverride ?? order.reviewRequest?.locale ?? order.locale,
    )
    const template = resolveReviewRequestTemplate(reviews.requestEmailTemplates, locale)
    const storedUrl = this.resolveStoredReviewUrl(
      order.reviewRequest?.tokenEncrypted,
      locale,
      order.countrySiteCode,
    )
    const reviewUrl =
      storedUrl ?? this.placeholderReviewUrl(locale, order.countrySiteCode)
    const vars = sampleReviewRequestVars({
      customerName: this.authorNameFromOrder(order),
      orderNumber: this.formatOrderNumber(order.orderNumber),
      reviewUrl,
    })
    const subject = fillReviewRequestTemplate(template.subject, vars).slice(0, 300)
    const bodyText = fillReviewRequestTemplate(template.body, vars)
    return {
      locale,
      toEmail: order.customerEmail?.trim() || null,
      subject,
      bodyText,
      bodyHtml: reviewRequestTemplateToHtml(bodyText),
      reviewUrl,
      reviewUrlIsPlaceholder: !storedUrl,
    }
  }

  /**
   * Manual send/resend.
   * Stable link: reuse encrypted raw token when present (no rotation).
   * confirmRegenerate / legacy rows without ciphertext → mint new token.
   */
  async sendEmailForOrder(
    orderId: string,
    staffUserId: string,
    input: {
      locale?: string
      confirmRegenerate?: boolean
      idempotencyKey: string
    },
  ): Promise<ReviewRequestSendResult> {
    const reviews = await this.assertFeatureEnabled()

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        locale: true,
        countrySiteCode: true,
        customerEmail: true,
        customerFirstName: true,
        customerLastName: true,
        userId: true,
        reviewRequest: {
          select: {
            id: true,
            locale: true,
            sentAt: true,
            revokedAt: true,
            completedAt: true,
            expiresAt: true,
            tokenEncrypted: true,
          },
        },
      },
    })
    if (!order) throw new NotFoundException('Замовлення не знайдено.')
    if (this.isOrderBlocked(order)) {
      throw new BadRequestException('Для скасованого або відшкодованого замовлення не можна надіслати запит відгуку.')
    }
    const to = order.customerEmail?.trim()
    if (!to) {
      throw new BadRequestException('У замовленні немає email клієнта.')
    }

    let reviewUrl: string | null = null
    let regenerated = false
    const existing = order.reviewRequest

    if (existing?.revokedAt) {
      throw new BadRequestException('Запит відгуку відкликано. Спочатку перегенеруйте посилання.')
    }
    if (existing?.completedAt) {
      throw new BadRequestException('Клієнт уже залишив усі відгуки за цим посиланням.')
    }
    if (existing && existing.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Термін дії посилання минув. Перегенеруйте посилання.')
    }

    if (!existing) {
      const generated = await this.generateForOrder(orderId, staffUserId)
      reviewUrl = generated.reviewUrl
      regenerated = false
    } else if (input.confirmRegenerate) {
      const generated = await this.regenerateForOrder(orderId, staffUserId)
      reviewUrl = generated.reviewUrl
      regenerated = true
    } else {
      const localeForUrl = this.resolveLocale(existing.locale ?? order.locale)
      reviewUrl = this.resolveStoredReviewUrl(
        existing.tokenEncrypted,
        localeForUrl,
        order.countrySiteCode,
      )
      if (!reviewUrl) {
        throw new ConflictException({
          statusCode: 409,
          message:
            'Для надсилання потрібно згенерувати нове посилання (старе не відновлюється). Попереднє посилання перестане працювати.',
          code: 'REVIEW_REQUEST_REGENERATE_REQUIRED',
        })
      }
      regenerated = false
    }

    if (!reviewUrl) {
      throw new BadRequestException('Не вдалося підготувати посилання для відгуку.')
    }

    const freshRequest = await this.prisma.reviewRequest.findUnique({
      where: { orderId },
      select: { id: true, locale: true, sentAt: true },
    })
    if (!freshRequest) throw new NotFoundException('Запит відгуку не знайдено.')

    const locale = this.resolveLocale(
      input.locale ?? freshRequest.locale ?? order.locale,
    )

    return this.deliverReviewRequestEmail({
      order,
      to,
      locale,
      reviewUrl,
      regenerated,
      source: CommunicationSource.MANUAL,
      createdByUserId: staffUserId,
      idempotencyKey: customerReviewRequestIdempotencyKey(
        order.id,
        input.idempotencyKey.trim(),
      ),
      requestId: freshRequest.id,
      requestSentAt: freshRequest.sentAt,
      reviews,
    })
  }

  /** Shared Phase 3/4 send path — Communication + mail + first sentAt stamp. */
  private async deliverReviewRequestEmail(input: {
    order: {
      id: string
      orderNumber: number
      countrySiteCode: string | null
      customerFirstName: string
      customerLastName: string
      userId: string | null
    }
    to: string
    locale: string
    reviewUrl: string
    regenerated: boolean
    source: CommunicationSource
    createdByUserId: string | null
    idempotencyKey: string
    requestId: string
    requestSentAt: Date | null
    reviews: ReviewsSettings
  }): Promise<ReviewRequestSendResult> {
    const template = resolveReviewRequestTemplate(
      input.reviews.requestEmailTemplates,
      input.locale,
    )
    const vars = sampleReviewRequestVars({
      customerName: this.authorNameFromOrder(input.order),
      orderNumber: this.formatOrderNumber(input.order.orderNumber),
      reviewUrl: input.reviewUrl,
    })
    const subject = fillReviewRequestTemplate(template.subject, vars).slice(0, 300)
    const bodyText = fillReviewRequestTemplate(template.body, vars)
    const bodyHtml = reviewRequestTemplateToHtml(bodyText)
    const { idempotencyKey } = input

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          let row = await tx.communication.findUnique({ where: { idempotencyKey } })
          if (!row) {
            try {
              row = await tx.communication.create({
                data: {
                  orderId: input.order.id,
                  userId: input.order.userId ?? null,
                  audience: CommunicationAudience.CUSTOMER,
                  type: CommunicationType.CUSTOMER_REVIEW_REQUEST,
                  source: input.source,
                  status: CommunicationStatus.PENDING,
                  idempotencyKey,
                  toEmail: input.to,
                  locale: input.locale,
                  createdByUserId: input.createdByUserId,
                  provider: 'resend',
                  subjectSnapshot: subject,
                  bodySnapshot: bodyText,
                },
              })
            } catch (error) {
              if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
              ) {
                row = await tx.communication.findUnique({ where: { idempotencyKey } })
                if (!row) throw error
              } else {
                throw error
              }
            }
          }

          await tx.$executeRaw`
            SELECT 1 FROM "Communication" WHERE id = ${row.id} FOR UPDATE
          `
          row = await tx.communication.findUniqueOrThrow({ where: { id: row.id } })

          if (
            row.status === CommunicationStatus.SENT ||
            row.status === CommunicationStatus.SKIPPED
          ) {
            return {
              communication: this.mapCommunication(row),
              reviewUrl: null,
              regenerated: input.regenerated,
              requestSentAt: input.requestSentAt?.toISOString() ?? null,
            }
          }

          // FAILED is terminal for this attempt key — never mutate FAILED → SENT.
          // Auto retries use a new BullMQ attempt → new idempotency key → new row.
          // Manual retries must use a new client nonce (UI already does).
          if (row.status === CommunicationStatus.FAILED) {
            throw new ServiceUnavailableException(
              row.errorMessage?.trim() ||
                'Попередня спроба надсилання не вдалася. Створіть нову спробу.',
            )
          }

          try {
            const result = await this.mail.sendCustomerReviewRequestEmail({
              to: input.to,
              subject,
              text: bodyText,
              html: bodyHtml,
              countrySiteCode: input.order.countrySiteCode as 'sk' | 'hu' | 'at' | null,
            })
            const updated = await tx.communication.update({
              where: { id: row.id },
              data: {
                status: CommunicationStatus.SENT,
                providerMessageId: result.id,
                subjectSnapshot: result.subject,
                bodySnapshot: result.text,
                sentAt: new Date(),
                errorMessage: null,
                toEmail: input.to,
                locale: input.locale,
              },
            })

            let requestSentAt = input.requestSentAt
            if (!requestSentAt) {
              const stamped = await tx.reviewRequest.update({
                where: { id: input.requestId },
                data: { sentAt: new Date() },
                select: { sentAt: true },
              })
              requestSentAt = stamped.sentAt
            }

            return {
              communication: this.mapCommunication(updated),
              reviewUrl: input.reviewUrl,
              regenerated: input.regenerated,
              requestSentAt: requestSentAt?.toISOString() ?? null,
            }
          } catch (error) {
            await tx.communication.update({
              where: { id: row.id },
              data: {
                status: CommunicationStatus.FAILED,
                subjectSnapshot: subject,
                bodySnapshot: bodyText,
                errorMessage: error instanceof Error ? error.message : String(error),
              },
            })
            throw new ServiceUnavailableException(
              error instanceof Error ? error.message : 'Не вдалося надіслати лист.',
            )
          }
        },
        { maxWait: 10_000, timeout: 60_000 },
      )
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error
      throw error
    }
  }

  private mapCommunication(row: {
    id: string
    status: CommunicationStatus
    toEmail: string | null
    subjectSnapshot: string | null
    bodySnapshot: string | null
    locale: string | null
    providerMessageId: string | null
    errorMessage: string | null
    sentAt: Date | null
    createdAt: Date
    source: CommunicationSource
    type: CommunicationType
  }) {
    return {
      id: row.id,
      status: row.status,
      toEmail: row.toEmail,
      subjectSnapshot: row.subjectSnapshot,
      bodySnapshot: row.bodySnapshot,
      locale: row.locale,
      providerMessageId: row.providerMessageId,
      errorMessage:
        row.status === CommunicationStatus.FAILED || row.status === CommunicationStatus.SKIPPED
          ? row.errorMessage
          : null,
      sentAt: row.sentAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      source: row.source,
      type: row.type,
    }
  }
}
