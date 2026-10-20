import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { Prisma, ReviewStatus, ReviewVerificationType } from '@prisma/client'

import { CatalogMediaService } from '../media/catalog-media.service'
import { PrismaService } from '../prisma/prisma.service'
import { QueueService } from '../queue/queue.service'
import { SettingsService } from '../settings/settings.service'
import { collectReviewImageUrls } from './review-request-pending-media'
import { CreateReviewDto } from './dto/create-review.dto'
import {
  ReviewGroupBy,
  ReviewQueryDto,
  ReviewSortOrder,
  ReviewTypeFilter,
} from './dto/review-query.dto'
import { UpdateReviewImagesDto } from './dto/update-review-images.dto'
import { UpdateReviewReplyDto } from './dto/update-review-reply.dto'
import { UpdateReviewStatusDto } from './dto/update-review-status.dto'
import { REVIEW_IMAGE_PATH_REGEX } from './review.constants'
import {
  orderReviewsByGroupKeys,
  paginateSubmissionGroups,
  uniqueStubsById,
  type ReviewGroupStub,
} from './review-group-pagination'
import {
  type BackstageReviewListItem,
  type PublicReviewListItem,
  toBackstageReviewListItem,
  toPublicReviewListItem,
} from './review-serializers'
import {
  REVIEW_ELIGIBLE_ORDER_STATUSES,
  REVIEW_EXCLUDED_PAYMENT_STATUS,
  collectPurchasedVariantLabels,
  noneVerification,
  type ReviewVerificationDecision,
} from './review-verification'

const DEFAULT_LOCALE = 'uk'
const DEFAULT_PAGE_SIZE = 10
const SUPPORTED_REVIEW_LOCALES = new Set(['uk', 'en', 'sk', 'cs', 'hu', 'de'])

export type { BackstageReviewListItem, PublicReviewListItem, ReviewStoreReplyDto as ReviewStoreReply } from './review-serializers'

/** @deprecated Prefer PublicReviewListItem / BackstageReviewListItem */
export type ReviewListItem = BackstageReviewListItem

export type ReviewsPageResult = {
  items: PublicReviewListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly catalogMedia: CatalogMediaService,
    private readonly queue: QueueService,
  ) {}

  private normalizeEmail(email?: string | null): string | null {
    const trimmed = email?.trim().toLowerCase()
    return trimmed || null
  }

  private normalizePhone(phone?: string | null): string | null {
    const trimmed = phone?.trim()
    return trimmed || null
  }

  private normalizeImages(images?: string[] | null, legacyImage?: string | null): string[] {
    const fromList = (images ?? [])
      .map((item) => item?.trim())
      .filter((item): item is string => Boolean(item))

    const combined =
      fromList.length > 0
        ? fromList
        : legacyImage?.trim()
          ? [legacyImage.trim()]
          : []

    const unique: string[] = []
    for (const url of combined) {
      if (!REVIEW_IMAGE_PATH_REGEX.test(url)) {
        throw new BadRequestException('Некоректне посилання на зображення.')
      }
      if (!unique.includes(url)) unique.push(url)
      if (unique.length >= 3) break
    }

    return unique
  }

  private buildWhere(query: ReviewQueryDto, publishedOnly: boolean): Prisma.ReviewWhereInput {
    const where: Prisma.ReviewWhereInput = {}

    if (publishedOnly) {
      where.status = ReviewStatus.APPROVED
    } else if (query.status) {
      where.status = query.status
    }

    if (query.type === ReviewTypeFilter.STORE) {
      where.productId = null
    } else if (query.type === ReviewTypeFilter.PRODUCT) {
      where.productId = { not: null }
    }

    if (query.rating) {
      where.rating = query.rating
    }

    if (query.productId) {
      where.productId = query.productId
    }

    return where
  }

  private resolveOrderBy(sort?: ReviewSortOrder): Prisma.ReviewOrderByWithRelationInput | Prisma.ReviewOrderByWithRelationInput[] {
    if (sort === ReviewSortOrder.OLDEST) {
      return { createdAt: 'asc' }
    }
    if (sort === ReviewSortOrder.RATING_DESC) {
      return [{ rating: 'desc' }, { createdAt: 'desc' }]
    }
    if (sort === ReviewSortOrder.RATING_ASC) {
      return [{ rating: 'asc' }, { createdAt: 'desc' }]
    }
    return { createdAt: 'desc' }
  }

  private resolvePagination(query: ReviewQueryDto) {
    const page = query.page ?? 1
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, 50)
    return { page, pageSize, skip: (page - 1) * pageSize }
  }

  private resolvePublicLocale(locale?: string | null): string {
    const normalized = locale?.trim().toLowerCase()
    if (normalized && SUPPORTED_REVIEW_LOCALES.has(normalized)) return normalized
    return DEFAULT_LOCALE
  }

  private productInclude() {
    return {
      product: {
        select: {
          slug: true,
          latinName: true,
          translations: {
            select: { locale: true, name: true },
          },
        },
      },
      order: {
        select: {
          deliveryCountryCode: true,
        },
      },
    } satisfies Prisma.ReviewInclude
  }

  private stubSelect() {
    return {
      id: true,
      orderId: true,
      productId: true,
      createdAt: true,
      rating: true,
    } satisfies Prisma.ReviewSelect
  }

  /**
   * Group-aware list: pageSize/total = submission groups.
   * Used for homepage + /reviews ALL. STORE/PRODUCT/PDP keep row pagination.
   */
  private shouldGroupBySubmission(query: ReviewQueryDto): boolean {
    if (query.groupBy !== ReviewGroupBy.SUBMISSION) return false
    if (query.productId) return false
    if (query.type === ReviewTypeFilter.STORE || query.type === ReviewTypeFilter.PRODUCT) {
      return false
    }
    return true
  }

  private async findPublishedGrouped(
    query: ReviewQueryDto,
    locale: string,
  ): Promise<ReviewsPageResult> {
    const where = this.buildWhere(query, true)
    const { page, pageSize } = this.resolvePagination(query)
    const sort = query.sort ?? ReviewSortOrder.NEWEST

    const matchingStubs = (await this.prisma.review.findMany({
      where,
      select: this.stubSelect(),
    })) as ReviewGroupStub[]

    let workingStubs = matchingStubs
    // Rating (or other) filters may match only part of an order — expand siblings
    // so the UI can render a complete submission card.
    if (query.rating) {
      const orderIds = [
        ...new Set(
          matchingStubs
            .map((row) => row.orderId?.trim())
            .filter((id): id is string => Boolean(id)),
        ),
      ]
      if (orderIds.length > 0) {
        const siblings = (await this.prisma.review.findMany({
          where: {
            status: ReviewStatus.APPROVED,
            orderId: { in: orderIds },
          },
          select: this.stubSelect(),
        })) as ReviewGroupStub[]
        const standalones = matchingStubs.filter((row) => !row.orderId?.trim())
        workingStubs = uniqueStubsById([...siblings, ...standalones])
      }
    }

    const groupPage = paginateSubmissionGroups(workingStubs, {
      page,
      pageSize,
      sort,
    })

    if (groupPage.groupKeys.length === 0) {
      return {
        items: [],
        total: groupPage.total,
        page: groupPage.page,
        pageSize: groupPage.pageSize,
        totalPages: groupPage.totalPages,
      }
    }

    const orClauses: Prisma.ReviewWhereInput[] = []
    if (groupPage.orderIds.length > 0) {
      orClauses.push({ orderId: { in: groupPage.orderIds } })
    }
    if (groupPage.standaloneIds.length > 0) {
      orClauses.push({ id: { in: groupPage.standaloneIds }, orderId: null })
    }

    const reviews = await this.prisma.review.findMany({
      where: {
        status: ReviewStatus.APPROVED,
        OR: orClauses,
      },
      include: this.productInclude(),
    })

    const ordered = orderReviewsByGroupKeys(reviews, groupPage.groupKeys)

    return {
      items: ordered.map((review) => toPublicReviewListItem(review, locale)),
      total: groupPage.total,
      page: groupPage.page,
      pageSize: groupPage.pageSize,
      totalPages: groupPage.totalPages,
    }
  }

  private eligibleOrderWhere(userId: string): Prisma.OrderWhereInput {
    return {
      userId,
      status: { in: [...REVIEW_ELIGIBLE_ORDER_STATUSES] },
      NOT: { paymentStatus: REVIEW_EXCLUDED_PAYMENT_STATUS },
    }
  }

  private eligibleOrderOrderBy(): Prisma.OrderOrderByWithRelationInput[] {
    return [
      { shippedAt: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
      { id: 'desc' },
    ]
  }

  private async resolveProductVerification(
    userId: string,
    productId: string,
  ): Promise<ReviewVerificationDecision> {
    const orders = await this.prisma.order.findMany({
      where: {
        ...this.eligibleOrderWhere(userId),
        items: {
          some: {
            productVariantId: { not: null },
            productVariant: { productId },
          },
        },
      },
      orderBy: this.eligibleOrderOrderBy(),
      select: {
        id: true,
        items: {
          where: {
            productVariantId: { not: null },
            productVariant: { productId },
          },
          select: {
            productVariantId: true,
            variantLabel: true,
            productVariant: { select: { productId: true } },
          },
        },
      },
    })

    if (!orders.length) return noneVerification()

    const usedOrderIds = new Set(
      (
        await this.prisma.review.findMany({
          where: {
            productId,
            orderId: { in: orders.map((order) => order.id) },
          },
          select: { orderId: true },
        })
      )
        .map((row) => row.orderId)
        .filter((id): id is string => Boolean(id)),
    )

    for (const order of orders) {
      if (usedOrderIds.has(order.id)) continue

      const hasFkMatch = order.items.some(
        (item) => item.productVariantId && item.productVariant?.productId === productId,
      )
      if (!hasFkMatch) continue

      const labels = collectPurchasedVariantLabels(
        order.items.map((item) => ({
          productVariantId: item.productVariantId,
          matchesReviewedProduct: item.productVariant?.productId === productId,
          variantLabel: item.variantLabel,
        })),
      )

      return {
        verificationType: 'VERIFIED_PURCHASE',
        orderId: order.id,
        purchasedVariantLabels: labels,
      }
    }

    return noneVerification()
  }

  private async resolveStoreVerification(userId: string): Promise<ReviewVerificationDecision> {
    const orders = await this.prisma.order.findMany({
      where: this.eligibleOrderWhere(userId),
      orderBy: this.eligibleOrderOrderBy(),
      select: { id: true },
    })

    if (!orders.length) return noneVerification()

    const usedOrderIds = new Set(
      (
        await this.prisma.review.findMany({
          where: {
            productId: null,
            orderId: { in: orders.map((order) => order.id) },
          },
          select: { orderId: true },
        })
      )
        .map((row) => row.orderId)
        .filter((id): id is string => Boolean(id)),
    )

    for (const order of orders) {
      if (usedOrderIds.has(order.id)) continue
      return {
        verificationType: 'VERIFIED_CUSTOMER',
        orderId: order.id,
        purchasedVariantLabels: [],
      }
    }

    return noneVerification()
  }

  private async resolveVerification(
    userId: string | null | undefined,
    productId: string | null,
  ): Promise<ReviewVerificationDecision> {
    if (!userId) return noneVerification()
    if (productId) return this.resolveProductVerification(userId, productId)
    return this.resolveStoreVerification(userId)
  }

  private isUniqueVerificationConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  }

  async findPublished(query: ReviewQueryDto = {}): Promise<ReviewsPageResult> {
    const locale = this.resolvePublicLocale(query.locale)

    if (this.shouldGroupBySubmission(query)) {
      return this.findPublishedGrouped(query, locale)
    }

    const where = this.buildWhere(query, true)
    const { page, pageSize, skip } = this.resolvePagination(query)
    const orderBy = this.resolveOrderBy(query.sort)

    const [total, reviews] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        include: this.productInclude(),
        orderBy,
        skip,
        take: pageSize,
      }),
    ])

    return {
      items: reviews.map((review) => toPublicReviewListItem(review, locale)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  }

  async findAllBackstage(query: ReviewQueryDto = {}): Promise<BackstageReviewListItem[]> {
    const locale = this.resolvePublicLocale(query.locale)
    const reviews = await this.prisma.review.findMany({
      where: this.buildWhere(query, false),
      include: this.productInclude(),
      orderBy: { createdAt: 'desc' },
    })
    return reviews.map((review) => toBackstageReviewListItem(review, locale))
  }

  private async assertProductReviewable(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, isPublished: true },
    })
    if (!product) {
      throw new BadRequestException('Товар не знайдено.')
    }
    if (!product.isPublished) {
      throw new BadRequestException('Неможливо залишити відгук для неопублікованого товару.')
    }
  }

  async create(userId: string | null | undefined, dto: CreateReviewDto): Promise<PublicReviewListItem> {
    let email: string | null
    let phone: string | null

    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, phone: true },
      })
      if (!user) {
        throw new BadRequestException('Користувача не знайдено.')
      }

      email = this.normalizeEmail(dto.email) ?? this.normalizeEmail(user.email)
      phone = this.normalizePhone(dto.phone) ?? this.normalizePhone(user.phone)
      if (!email && !phone) {
        throw new BadRequestException('У профілі немає email або телефону для відгуку.')
      }
    } else {
      const market = await this.settings.getMarketSettings()
      if (!market.allowGuestReviews) {
        throw new UnauthorizedException('Увійдіть, щоб залишити відгук.')
      }

      email = this.normalizeEmail(dto.email)
      phone = this.normalizePhone(dto.phone)
      if (!email && !phone) {
        throw new BadRequestException('Вкажіть email або телефон для відгуку.')
      }
    }

    const productId = dto.productId?.trim() || null
    if (productId) {
      await this.assertProductReviewable(productId)
    }

    const images = this.normalizeImages(dto.images, dto.image)
    const verification = await this.resolveVerification(userId, productId)

    try {
      const created = await this.prisma.review.create({
        data: {
          userId: userId || null,
          productId,
          orderId: verification.orderId,
          verificationType: verification.verificationType as ReviewVerificationType,
          purchasedVariantLabels: [...verification.purchasedVariantLabels],
          authorName: dto.authorName.trim(),
          email,
          phone,
          text: dto.text.trim(),
          image: images[0] ?? null,
          images,
          rating: dto.rating,
          status: ReviewStatus.PENDING,
        },
        include: this.productInclude(),
      })

      return toPublicReviewListItem(created)
    } catch (error) {
      if (this.isUniqueVerificationConflict(error)) {
        throw new ConflictException(
          productId
            ? 'Ви вже залишили відгук про цей товар для цього замовлення.'
            : 'Ви вже залишили відгук про магазин для цього замовлення.',
        )
      }
      throw error
    }
  }

  async countPendingBackstage(): Promise<{ count: number }> {
    const count = await this.prisma.review.count({
      where: { status: ReviewStatus.PENDING },
    })
    return { count }
  }

  async updateStatus(id: string, dto: UpdateReviewStatusDto): Promise<BackstageReviewListItem> {
    try {
      const updated = await this.prisma.review.update({
        where: { id },
        data: { status: dto.status },
        include: this.productInclude(),
      })
      return toBackstageReviewListItem(updated)
    } catch {
      throw new NotFoundException('Відгук не знайдено.')
    }
  }

  /** Approve/reject every review tied to one order (post-purchase submission bundle). */
  async updateStatusByOrderId(
    orderId: string,
    dto: UpdateReviewStatusDto,
  ): Promise<{ updated: number; orderId: string; status: ReviewStatus }> {
    const trimmed = orderId?.trim()
    if (!trimmed) {
      throw new BadRequestException('Некоректний ідентифікатор замовлення.')
    }
    const result = await this.prisma.review.updateMany({
      where: { orderId: trimmed },
      data: { status: dto.status },
    })
    if (result.count === 0) {
      throw new NotFoundException('Відгуків для цього замовлення не знайдено.')
    }
    return { updated: result.count, orderId: trimmed, status: dto.status }
  }

  async updateReply(id: string, dto: UpdateReviewReplyDto): Promise<BackstageReviewListItem> {
    const text = dto.text?.trim() ?? ''
    const clearing = !text

    if (!clearing) {
      const authorName = dto.authorName?.trim()
      if (!authorName || authorName.length < 2) {
        throw new BadRequestException('Вкажіть імʼя відповідального.')
      }
    }

    try {
      const updated = await this.prisma.review.update({
        where: { id },
        data: clearing
          ? {
              storeReplyText: null,
              storeReplyAuthorName: null,
              storeReplyAt: null,
            }
          : {
              storeReplyText: text,
              storeReplyAuthorName: dto.authorName.trim(),
              storeReplyAt: new Date(),
            },
        include: this.productInclude(),
      })
      return toBackstageReviewListItem(updated)
    } catch {
      throw new NotFoundException('Відгук не знайдено.')
    }
  }

  /**
   * Staff: replace images with a subset of the current list (remove unwanted photos).
   * Cannot attach arbitrary storage paths from other reviews.
   */
  async updateImages(id: string, dto: UpdateReviewImagesDto): Promise<BackstageReviewListItem> {
    const existing = await this.prisma.review.findUnique({
      where: { id },
      select: { id: true, images: true, image: true },
    })
    if (!existing) throw new NotFoundException('Відгук не знайдено.')

    const current = this.normalizeImages(existing.images, existing.image)
    const next = this.normalizeImages(dto.images, null)
    for (const url of next) {
      if (!current.includes(url)) {
        throw new BadRequestException(
          'Можна лише прибрати існуючі фото цього відгуку, не додавати чужі шляхи.',
        )
      }
    }
    const removed = current.filter((url) => !next.includes(url))

    const updated = await this.prisma.review.update({
      where: { id },
      data: {
        images: next,
        image: next[0] ?? null,
      },
      include: this.productInclude(),
    })

    const failedUrls: string[] = []
    for (const url of removed) {
      try {
        await this.catalogMedia.deleteReviewImageByPublicUrl(url)
      } catch (err) {
        failedUrls.push(url)
        this.logger.warn(
          `Failed to delete review image ${url} after staff edit: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }
    if (failedUrls.length) {
      await this.queue
        .enqueueReviewMediaDelete({
          urls: failedUrls,
          reason: `staff-image-edit:${id}`,
        })
        .catch((err) => {
          this.logger.error(
            `Failed to enqueue media delete after staff edit ${id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        })
    }
    this.logger.log(
      `Staff updated review ${id} images: kept=${next.length} removed=${removed.length}`,
    )
    return toBackstageReviewListItem(updated)
  }

  /**
   * Delete review row first (source of truth), then remove owned media.
   * Storage failures are retried via BullMQ; attached-check skips if re-uploaded elsewhere.
   */
  async remove(id: string): Promise<void> {
    const existing = await this.prisma.review.findUnique({
      where: { id },
      select: { id: true, images: true, image: true },
    })
    if (!existing) throw new NotFoundException('Відгук не знайдено.')

    const urls = collectReviewImageUrls(existing)

    try {
      await this.prisma.review.delete({ where: { id } })
    } catch {
      throw new NotFoundException('Відгук не знайдено.')
    }

    this.logger.log(`Staff deleted review ${id}; scheduling media cleanup urls=${urls.length}`)

    if (urls.length === 0) return

    const failedUrls: string[] = []
    for (const url of urls) {
      try {
        await this.catalogMedia.deleteReviewImageByPublicUrl(url)
      } catch (err) {
        failedUrls.push(url)
        this.logger.warn(
          `Failed to delete review media ${url} after review ${id} delete: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }
    if (failedUrls.length) {
      await this.queue
        .enqueueReviewMediaDelete({
          urls: failedUrls,
          reason: `review-delete:${id}`,
        })
        .catch((err) => {
          this.logger.error(
            `Failed to enqueue media delete after review ${id} delete: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        })
    }
  }
}
