import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, ReviewStatus } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { CreateReviewDto } from './dto/create-review.dto'
import { ReviewQueryDto, ReviewSortOrder, ReviewTypeFilter } from './dto/review-query.dto'
import { UpdateReviewReplyDto } from './dto/update-review-reply.dto'
import { UpdateReviewStatusDto } from './dto/update-review-status.dto'
import { REVIEW_IMAGE_PATH_REGEX } from './review.constants'

const DEFAULT_LOCALE = 'uk'
const DEFAULT_PAGE_SIZE = 10

export type ReviewStoreReply = {
  authorName: string
  text: string
  createdAt: string
}

export type ReviewListItem = {
  id: string
  authorName: string
  email: string | null
  phone: string | null
  text: string
  image: string | null
  images: string[]
  rating: number
  productId: string | null
  productName: string | null
  productSlug: string | null
  status: ReviewStatus
  storeReply: ReviewStoreReply | null
  legacyId: string | null
  legacySource: string | null
  importedAt: string | null
  createdAt: string
  updatedAt: string
}

export type ReviewsPageResult = {
  items: ReviewListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

type ReviewRecord = {
  id: string
  authorName: string
  email: string | null
  phone: string | null
  text: string
  image: string | null
  images: string[]
  rating: number
  productId: string | null
  status: ReviewStatus
  storeReplyText: string | null
  storeReplyAuthorName: string | null
  storeReplyAt: Date | null
  legacyId: string | null
  legacySource: string | null
  importedAt: Date | null
  createdAt: Date
  updatedAt: Date
  product?: {
    slug: string
    translations: Array<{ name: string }>
  } | null
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private resolveReviewImages(review: { image: string | null; images?: string[] }): string[] {
    if (review.images?.length) return review.images
    return review.image ? [review.image] : []
  }

  private buildStoreReply(review: ReviewRecord): ReviewStoreReply | null {
    const text = review.storeReplyText?.trim()
    if (!text) return null
    return {
      authorName: review.storeReplyAuthorName?.trim() || 'Зелені Янголи',
      text,
      createdAt: (review.storeReplyAt ?? review.updatedAt).toISOString(),
    }
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

  private resolveOrderBy(sort?: ReviewSortOrder): Prisma.ReviewOrderByWithRelationInput {
    if (sort === ReviewSortOrder.OLDEST) {
      return { createdAt: 'asc' }
    }
    return { createdAt: 'desc' }
  }

  private resolvePagination(query: ReviewQueryDto) {
    const page = query.page ?? 1
    const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, 50)
    return { page, pageSize, skip: (page - 1) * pageSize }
  }

  private productInclude() {
    return {
      product: {
        select: {
          slug: true,
          translations: {
            where: { locale: DEFAULT_LOCALE },
            select: { name: true },
            take: 1,
          },
        },
      },
    } satisfies Prisma.ReviewInclude
  }

  private toListItem(review: ReviewRecord): ReviewListItem {
    const productName = review.product?.translations[0]?.name ?? null
    return {
      id: review.id,
      authorName: review.authorName,
      email: review.email,
      phone: review.phone,
      text: review.text,
      image: this.resolveReviewImages(review)[0] ?? null,
      images: this.resolveReviewImages(review),
      rating: review.rating,
      productId: review.productId,
      productName,
      productSlug: review.product?.slug ?? null,
      status: review.status,
      storeReply: this.buildStoreReply(review),
      legacyId: review.legacyId,
      legacySource: review.legacySource,
      importedAt: review.importedAt?.toISOString() ?? null,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    }
  }

  async findPublished(query: ReviewQueryDto = {}): Promise<ReviewsPageResult> {
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
      items: reviews.map((review) => this.toListItem(review)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  }

  async findAllBackstage(query: ReviewQueryDto = {}): Promise<ReviewListItem[]> {
    const reviews = await this.prisma.review.findMany({
      where: this.buildWhere(query, false),
      include: this.productInclude(),
      orderBy: { createdAt: 'desc' },
    })
    return reviews.map((review) => this.toListItem(review))
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

  async create(userId: string, dto: CreateReviewDto): Promise<ReviewListItem> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    })
    if (!user) {
      throw new BadRequestException('Користувача не знайдено.')
    }

    const email = this.normalizeEmail(dto.email) ?? this.normalizeEmail(user.email)
    const phone = this.normalizePhone(dto.phone) ?? this.normalizePhone(user.phone)
    if (!email && !phone) {
      throw new BadRequestException('У профілі немає email або телефону для відгуку.')
    }

    const productId = dto.productId?.trim() || null
    if (productId) {
      await this.assertProductReviewable(productId)
    }

    const images = this.normalizeImages(dto.images, dto.image)

    const created = await this.prisma.review.create({
      data: {
        userId,
        productId,
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

    return this.toListItem(created)
  }

  async updateStatus(id: string, dto: UpdateReviewStatusDto): Promise<ReviewListItem> {
    try {
      const updated = await this.prisma.review.update({
        where: { id },
        data: { status: dto.status },
        include: this.productInclude(),
      })
      return this.toListItem(updated)
    } catch {
      throw new NotFoundException('Відгук не знайдено.')
    }
  }

  async updateReply(id: string, dto: UpdateReviewReplyDto): Promise<ReviewListItem> {
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
      return this.toListItem(updated)
    } catch {
      throw new NotFoundException('Відгук не знайдено.')
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.review.delete({ where: { id } })
    } catch {
      throw new NotFoundException('Відгук не знайдено.')
    }
  }
}
