import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { ProductsService } from '../products/products.service'
import { MergeFavoritesDto } from './dto/merge-favorites.dto'

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  private async assertPublishedProduct(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, isPublished: true },
    })
    if (!product) {
      throw new NotFoundException('Товар не знайдено.')
    }
    if (!product.isPublished) {
      throw new BadRequestException('Неможливо додати неопублікований товар до обраного.')
    }
  }

  async findProductIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { productId: true },
    })
    return rows.map((row) => row.productId)
  }

  async findProducts(userId: string, locale?: string) {
    const productIds = await this.findProductIds(userId)
    if (!productIds.length) return []
    const products = await this.products.findByIds(productIds, locale)
    const order = new Map(productIds.map((id, index) => [id, index]))
    return products.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  }

  async add(userId: string, productId: string): Promise<string[]> {
    await this.assertPublishedProduct(productId)
    await this.prisma.userFavorite.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    })
    return this.findProductIds(userId)
  }

  async remove(userId: string, productId: string): Promise<string[]> {
    await this.prisma.userFavorite.deleteMany({
      where: { userId, productId },
    })
    return this.findProductIds(userId)
  }

  async merge(userId: string, dto: MergeFavoritesDto): Promise<string[]> {
    const uniqueIds = [...new Set(dto.productIds)]
    if (!uniqueIds.length) return this.findProductIds(userId)

    const published = await this.prisma.product.findMany({
      where: { id: { in: uniqueIds }, isPublished: true },
      select: { id: true },
    })
    const validIds = published.map((row) => row.id)
    if (!validIds.length) return this.findProductIds(userId)

    await this.prisma.userFavorite.createMany({
      data: validIds.map((productId) => ({ userId, productId })),
      skipDuplicates: true,
    })

    return this.findProductIds(userId)
  }
}
