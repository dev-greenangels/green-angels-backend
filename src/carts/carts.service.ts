import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import type { Request, Response } from 'express'
import { randomUUID } from 'crypto'

import { VariantLabelService } from '../products/variant-label.service'
import { VARIANT_LABEL_ATTRIBUTE_SELECT } from '../products/variant-label.util'
import { PrismaService } from '../prisma/prisma.service'
import {
  GUEST_CART_COOKIE_NAME,
  GUEST_CART_MAX_AGE_SEC,
  type CartLineDto,
  type CartLineView,
  type CartMergeStrategy,
} from './cart.constants'
import type { SyncCartDto } from './dto/sync-cart.dto'

type CartOwner =
  | { kind: 'user'; userId: string }
  | { kind: 'guest'; guestSessionId: string }

type CartItemDetails = Prisma.CartItemGetPayload<{
  include: {
    productVariant: {
      include: {
        attributeValues: {
          include: {
            value: {
              include: {
                translations: true
                attribute: true
              }
            }
          }
        }
        product: {
          include: {
            translations: true
          }
        }
      }
    }
  }
}>

@Injectable()
export class CartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly variantLabels: VariantLabelService,
  ) {}

  private defaultLocale(locale?: string) {
    return (locale?.trim() || 'uk').toLowerCase()
  }

  resolveOwner(req: Request, res?: Response): CartOwner {
    const userId = (req as Request & { user?: { userId?: string } }).user?.userId
    if (userId) return { kind: 'user', userId }

    let guestSessionId = req.cookies?.[GUEST_CART_COOKIE_NAME]?.trim()
    if (!guestSessionId) {
      guestSessionId = randomUUID()
      if (res) {
        res.cookie(GUEST_CART_COOKIE_NAME, guestSessionId, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: GUEST_CART_MAX_AGE_SEC * 1000,
          path: '/',
        })
      }
    }

    return { kind: 'guest', guestSessionId }
  }

  private async findCartByOwner(owner: CartOwner) {
    if (owner.kind === 'user') {
      return this.prisma.cart.findUnique({ where: { userId: owner.userId } })
    }
    return this.prisma.cart.findUnique({ where: { guestSessionId: owner.guestSessionId } })
  }

  private async ensureCart(owner: CartOwner) {
    const existing = await this.findCartByOwner(owner)
    if (existing) return existing

    if (owner.kind === 'user') {
      return this.prisma.cart.create({ data: { userId: owner.userId } })
    }

    return this.prisma.cart.create({ data: { guestSessionId: owner.guestSessionId } })
  }

  private cartItemInclude(locale: string) {
    return {
      productVariant: {
        include: {
          attributeValues: {
            include: {
              value: {
                include: {
                  translations: { where: { locale } },
                  attribute: { select: VARIANT_LABEL_ATTRIBUTE_SELECT },
                },
              },
            },
          },
          product: {
            include: {
              translations: { where: { locale } },
            },
          },
        },
      },
    }
  }

  private async loadCartItemRows(cartId: string, locale: string) {
    return this.prisma.cartItem.findMany({
      where: { cartId },
      include: this.cartItemInclude(locale),
      orderBy: { id: 'asc' },
    })
  }

  private toCartLineView(
    row: CartItemDetails,
    typeOrder: Awaited<ReturnType<VariantLabelService['getTypeOrder']>>,
  ): CartLineView {
    const product = row.productVariant.product
    return {
      productVariantId: row.productVariantId,
      quantity: row.quantity,
      productId: product.id,
      productSlug: product.slug,
      productName: product.translations[0]?.name ?? product.slug,
      variantLabel: this.variantLabels.buildFromLinksWithOrder(
        row.productVariant.attributeValues,
        typeOrder,
      ),
    }
  }

  private normalizeLines(items: CartLineDto[]): CartLineDto[] {
    const merged = new Map<string, number>()
    for (const item of items) {
      const id = item.productVariantId.trim()
      const quantity = Math.max(1, Math.floor(item.quantity))
      if (!id) continue
      merged.set(id, (merged.get(id) ?? 0) + quantity)
    }
    return [...merged.entries()].map(([productVariantId, quantity]) => ({
      productVariantId,
      quantity,
    }))
  }

  private async assertValidVariantIds(variantIds: string[]) {
    if (!variantIds.length) return

    const rows = await this.prisma.productVariant.findMany({
      where: {
        id: { in: variantIds },
        product: { isPublished: true },
      },
      select: { id: true },
    })

    if (rows.length !== variantIds.length) {
      throw new BadRequestException('Один або кілька товарів недоступні для кошика.')
    }
  }

  async getCart(owner: CartOwner, locale?: string): Promise<{ items: CartLineView[] }> {
    const loc = this.defaultLocale(locale)
    const cart = await this.findCartByOwner(owner)
    if (!cart) return { items: [] }

    const rows = await this.loadCartItemRows(cart.id, loc)
    const typeOrder = await this.variantLabels.getTypeOrder()

    return { items: rows.map((row) => this.toCartLineView(row, typeOrder)) }
  }

  async syncCart(owner: CartOwner, dto: SyncCartDto, locale?: string) {
    const lines = this.normalizeLines(dto.items)
    const variantIds = lines.map((line) => line.productVariantId)
    await this.assertValidVariantIds(variantIds)

    const cart = await this.ensureCart(owner)

    await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } })
      if (lines.length) {
        await tx.cartItem.createMany({
          data: lines.map((line) => ({
            cartId: cart.id,
            productVariantId: line.productVariantId,
            quantity: line.quantity,
          })),
        })
      }
      await tx.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } })
    })

    return this.getCart(owner, locale)
  }

  async getMergePreview(userId: string, guestSessionId: string | undefined, locale?: string) {
    const loc = this.defaultLocale(locale)
    const [guestCart, userCart] = await Promise.all([
      guestSessionId
        ? this.prisma.cart.findUnique({ where: { guestSessionId } })
        : Promise.resolve(null),
      this.prisma.cart.findUnique({ where: { userId } }),
    ])

    const loadLines = async (cartId: string) => {
      const rows = await this.loadCartItemRows(cartId, loc)
      const typeOrder = await this.variantLabels.getTypeOrder()
      return rows.map((row) => this.toCartLineView(row, typeOrder))
    }

    const guestItems = guestCart ? await loadLines(guestCart.id) : []
    const userItems = userCart ? await loadLines(userCart.id) : []

    return {
      hasConflict: guestItems.length > 0 && userItems.length > 0,
      guestItems,
      userItems,
    }
  }

  private mergeLines(guestItems: CartLineDto[], userItems: CartLineDto[]): CartLineDto[] {
    const merged = new Map<string, number>()
    for (const line of [...guestItems, ...userItems]) {
      const current = merged.get(line.productVariantId) ?? 0
      merged.set(line.productVariantId, Math.max(current, line.quantity))
    }
    return [...merged.entries()].map(([productVariantId, quantity]) => ({
      productVariantId,
      quantity,
    }))
  }

  async applyMerge(
    userId: string,
    guestSessionId: string | undefined,
    strategy: CartMergeStrategy,
    locale?: string,
    res?: Response,
  ) {
    const preview = await this.getMergePreview(userId, guestSessionId, locale)
    const guestCart = guestSessionId
      ? await this.prisma.cart.findUnique({ where: { guestSessionId } })
      : null
    const userCart = await this.prisma.cart.findUnique({ where: { userId } })

    let nextItems: CartLineDto[] = []

    switch (strategy) {
      case 'merge':
        nextItems = this.mergeLines(preview.guestItems, preview.userItems)
        break
      case 'keep_guest':
        nextItems = preview.guestItems
        break
      case 'keep_user':
        nextItems = preview.userItems
        break
      case 'clear':
        nextItems = []
        break
      default:
        throw new BadRequestException('Невідома стратегія обʼєднання кошика.')
    }

    await this.syncCart({ kind: 'user', userId }, { items: nextItems }, locale)

    if (guestCart) {
      await this.prisma.cartItem.deleteMany({ where: { cartId: guestCart.id } })
      await this.prisma.cart.delete({ where: { id: guestCart.id } })
    } else if (userCart && strategy === 'clear') {
      // already cleared via sync
    }

    if (res && guestSessionId) {
      this.clearGuestSessionCookie(res)
    }

    return this.getCart({ kind: 'user', userId }, locale)
  }

  private clearGuestSessionCookie(res: Response) {
    res.clearCookie(GUEST_CART_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })
  }

  async listBackstage(params: { search?: string; kind?: 'guest' | 'user' | 'all' }) {
    const loc = 'uk'
    const typeOrder = await this.variantLabels.getTypeOrder()
    const kind = params.kind ?? 'all'
    const where: Prisma.CartWhereInput = {
      items: { some: {} },
      ...(kind === 'guest' ? { userId: null, guestSessionId: { not: null } } : {}),
      ...(kind === 'user' ? { userId: { not: null } } : {}),
    }

    const carts = await this.prisma.cart.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        items: {
          include: this.cartItemInclude(loc),
          orderBy: { id: 'asc' },
        },
        _count: { select: { items: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    })

    const search = params.search?.trim().toLowerCase()
    const filtered = search
      ? carts.filter((cart) => {
          const userHaystack = [
            cart.user?.firstName,
            cart.user?.lastName,
            cart.user?.phone,
            cart.user?.email,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          const itemHaystack = cart.items
            .map((item) => this.toCartLineView(item, typeOrder).productName)
            .join(' ')
            .toLowerCase()
          return (
            userHaystack.includes(search) ||
            itemHaystack.includes(search) ||
            cart.guestSessionId?.toLowerCase().includes(search)
          )
        })
      : carts

    return filtered.map((cart) => ({
      id: cart.id,
      kind: cart.userId ? ('user' as const) : ('guest' as const),
      updatedAt: cart.updatedAt.toISOString(),
      createdAt: cart.createdAt.toISOString(),
      itemCount: cart._count.items,
      totalQuantity: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      guestSessionId: cart.guestSessionId,
      user: cart.user
        ? {
            id: cart.user.id,
            name: [cart.user.firstName, cart.user.lastName].filter(Boolean).join(' ').trim() || null,
            phone: cart.user.phone,
            email: cart.user.email,
          }
        : null,
      items: cart.items.map((item) => this.toCartLineView(item, typeOrder)),
    }))
  }

  async findBackstageOne(id: string) {
    const loc = 'uk'
    const typeOrder = await this.variantLabels.getTypeOrder()
    const cart = await this.prisma.cart.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
        items: {
          include: this.cartItemInclude(loc),
          orderBy: { id: 'asc' },
        },
      },
    })

    if (!cart) throw new NotFoundException('Кошик не знайдено.')

    return {
      id: cart.id,
      kind: cart.userId ? ('user' as const) : ('guest' as const),
      updatedAt: cart.updatedAt.toISOString(),
      createdAt: cart.createdAt.toISOString(),
      guestSessionId: cart.guestSessionId,
      user: cart.user
        ? {
            id: cart.user.id,
            name: [cart.user.firstName, cart.user.lastName].filter(Boolean).join(' ').trim() || null,
            phone: cart.user.phone,
            email: cart.user.email,
          }
        : null,
      items: cart.items.map((item) => this.toCartLineView(item, typeOrder)),
    }
  }
}
