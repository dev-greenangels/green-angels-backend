import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, ReviewStatus } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { CreateReviewDto } from './dto/create-review.dto'
import { ReviewQueryDto, ReviewTypeFilter } from './dto/review-query.dto'
import { UpdateReviewStatusDto } from './dto/update-review-status.dto'
import { REVIEW_IMAGE_PATH_REGEX } from './review.constants'

const DEFAULT_LOCALE = 'uk'

export type ReviewListItem = {
  id: string
  authorName: string
  email: string | null
  phone: string | null
  text: string
  image: string | null
  rating: number
  productId: string | null
  productName: string | null
  productSlug: string | null
  status: ReviewStatus
  legacyId: string | null
  legacySource: string | null
  importedAt: string | null
  createdAt: string
  updatedAt: string
}

type ReviewRecord = {
  id: string
  authorName: string
  email: string | null
  phone: string | null
  text: string
  image: string | null
  rating: number
  productId: string | null
  status: ReviewStatus
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

  private normalizeImage(image?: string | null): string | null {
    const trimmed = image?.trim()
    if (!trimmed) return null
    if (!REVIEW_IMAGE_PATH_REGEX.test(trimmed)) {
      throw new BadRequestException('Некоректне посилання на зображення.')
    }
    return trimmed
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
      image: review.image,
      rating: review.rating,
      productId: review.productId,
      productName,
      productSlug: review.product?.slug ?? null,
      status: review.status,
      legacyId: review.legacyId,
      legacySource: review.legacySource,
      importedAt: review.importedAt?.toISOString() ?? null,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    }
  }

  async findPublished(query: ReviewQueryDto = {}): Promise<ReviewListItem[]> {
    const reviews = await this.prisma.review.findMany({
      where: this.buildWhere(query, true),
      include: this.productInclude(),
      orderBy: { createdAt: 'desc' },
    })
    return reviews.map((review) => this.toListItem(review))
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
    const email = this.normalizeEmail(dto.email)
    const phone = this.normalizePhone(dto.phone)
    if (!email && !phone) {
      throw new BadRequestException('Вкажіть email або телефон.')
    }

    const productId = dto.productId?.trim() || null
    if (productId) {
      await this.assertProductReviewable(productId)
    }

    const created = await this.prisma.review.create({
      data: {
        userId,
        productId,
        authorName: dto.authorName.trim(),
        email,
        phone,
        text: dto.text.trim(),
        image: this.normalizeImage(dto.image),
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

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.review.delete({ where: { id } })
    } catch {
      throw new NotFoundException('Відгук не знайдено.')
    }
  }
}
