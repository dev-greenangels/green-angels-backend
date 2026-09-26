import {
  BadRequestException,
  Injectable,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Request, Response } from 'express'
import { randomUUID } from 'crypto'

import { RETAIL_PRICE_TYPE } from '../commerce/commerce.constants'
import { CommerceService } from '../commerce/commerce.service'
import { VariantLabelService } from '../products/variant-label.service'
import { VARIANT_LABEL_ATTRIBUTE_SELECT } from '../products/variant-label.util'
import { PrismaService } from '../prisma/prisma.service'
import {
  CustomerErrorCode,
  customerBadRequest,
  customerNotFound,
} from '../common/customer-error'
import {
  abandonedCutoff,
  cartActivityBucket,
  classifyCartActivity,
  type CartActivityState,
} from './cart-classification'
import { resolveCheckoutDraftAfterMerge } from './cart-merge-draft'
import {
  CHECKOUT_DRAFT_PII_RETENTION_DAYS,
  computeCheckoutDraftPiiCleanupAt,
  resolveCheckoutDraftPiiStatus,
  type CheckoutDraftPiiStatus,
} from './cart-pii-retention'
import {
  GUEST_CART_COOKIE_NAME,
  GUEST_CART_MAX_AGE_SEC,
  type CartLineDto,
  type CartLineView,
  type CartMergeStrategy,
} from './cart.constants'
import {
  normalizeCheckoutDraft,
  parseStoredCheckoutDraft,
  summarizeCheckoutDraft,
  type CheckoutDraftV1,
} from './checkout-draft'
import type { SyncCartDto } from './dto/sync-cart.dto'
import type { UpdateCheckoutDraftDto } from './dto/update-checkout-draft.dto'

export type CartOwner =
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

export type BackstageCartStateFilter =
  | 'all'
  | 'active'
  | 'abandoned'
  | 'cart_only'
  | 'checkout_started'
  | 'cart_abandoned'
  | 'checkout_abandoned'

@Injectable()
export class CartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly variantLabels: VariantLabelService,
    private readonly commerce: CommerceService,
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

  /**
   * Resolve cart owner without minting a guest cookie.
   * Used by CreateOrder cleanup — no cookie ⇒ nothing to clear.
   */
  resolveExistingOwner(req: Request): CartOwner | null {
    const userId = (req as Request & { user?: { userId?: string } }).user?.userId
    if (userId) return { kind: 'user', userId }
    const guestSessionId = req.cookies?.[GUEST_CART_COOKIE_NAME]?.trim()
    if (guestSessionId) return { kind: 'guest', guestSessionId }
    return null
  }

  /**
   * Empty cart contents + clear checkout draft/start markers.
   * No stock mutations. Idempotent when cart already empty / missing.
   */
  async clearCartContentsForOwner(owner: CartOwner): Promise<{ cleared: boolean }> {
    const cart = await this.findCartByOwner(owner)
    if (!cart) return { cleared: false }

    await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } })
      await tx.cart.update({
        where: { id: cart.id },
        data: {
          checkoutDraft: Prisma.DbNull,
          checkoutStartedAt: null,
          updatedAt: new Date(),
        },
      })
    })

    return { cleared: true }
  }

  /**
   * Clear only when every current cart line is covered by `orderItems`
   * (same variant, cart qty ≤ order qty). Skips if the customer added
   * newer lines after the order (idempotent replay safety).
   */
  async clearCartContentsForOwnerIfCoveredByOrderItems(
    owner: CartOwner,
    orderItems: Array<{ productVariantId: string; quantity: number }>,
  ): Promise<{ cleared: boolean; skippedReason?: string }> {
    const cart = await this.findCartByOwner(owner)
    if (!cart) return { cleared: false, skippedReason: 'missing_cart' }

    const lines = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      select: { productVariantId: true, quantity: true },
    })
    if (!lines.length) {
      // Still wipe leftover draft if items already empty.
      await this.prisma.cart.update({
        where: { id: cart.id },
        data: {
          checkoutDraft: Prisma.DbNull,
          checkoutStartedAt: null,
          updatedAt: new Date(),
        },
      })
      return { cleared: true }
    }

    const allowed = new Map<string, number>()
    for (const item of orderItems) {
      const id = item.productVariantId.trim()
      if (!id) continue
      allowed.set(id, (allowed.get(id) ?? 0) + Math.max(0, Math.floor(item.quantity)))
    }

    for (const line of lines) {
      const maxQty = allowed.get(line.productVariantId)
      if (maxQty == null || line.quantity > maxQty) {
        return { cleared: false, skippedReason: 'cart_has_newer_items' }
      }
    }

    return this.clearCartContentsForOwner(owner)
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
              images: {
                orderBy: { sortOrder: 'asc' as const },
                take: 1,
                select: { url: true },
              },
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
    row: CartItemDetails & {
      productVariant: {
        product: { images?: Array<{ url: string }> }
      }
    },
    typeOrder: Awaited<ReturnType<VariantLabelService['getTypeOrder']>>,
  ): CartLineView & { imageUrl?: string | null; unitPrice?: number | null; lineTotal?: number | null } {
    const product = row.productVariant.product
    return {
      productVariantId: row.productVariantId,
      quantity: row.quantity,
      productId: product.id,
      productSlug: product.slug,
      productName: product.translations[0]?.name ?? product.slug,
      latinName: product.latinName?.trim() || null,
      variantLabel: this.variantLabels.buildFromLinksWithOrder(
        row.productVariant.attributeValues,
        typeOrder,
      ),
      imageUrl: product.images?.[0]?.url ?? null,
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
      throw customerBadRequest(
        CustomerErrorCode.CART_ITEMS_UNAVAILABLE,
        'Один або кілька товарів недоступні для кошика.',
      )
    }
  }

  async getCart(owner: CartOwner, locale?: string): Promise<{ items: CartLineView[] }> {
    const loc = this.defaultLocale(locale)
    const cart = await this.findCartByOwner(owner)
    if (!cart) return { items: [] }

    const rows = await this.loadCartItemRows(cart.id, loc)
    const typeOrder = await this.variantLabels.getTypeOrder()

    return {
      items: rows.map((row) => {
        const view = this.toCartLineView(row, typeOrder)
        const { imageUrl: _imageUrl, unitPrice: _u, lineTotal: _l, ...line } = view
        return line
      }),
    }
  }

  async syncCart(owner: CartOwner, dto: SyncCartDto, locale?: string) {
    const lines = this.normalizeLines(dto.items)
    const variantIds = lines.map((line) => line.productVariantId)
    await this.assertValidVariantIds(variantIds)

    if (!lines.length) {
      await this.clearCartContentsForOwner(owner)
      // ensureCart is unnecessary for empty sync when cart missing — getCart returns [].
      const existing = await this.findCartByOwner(owner)
      if (!existing) return { items: [] as CartLineView[] }
      return this.getCart(owner, locale)
    }

    const cart = await this.ensureCart(owner)

    await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } })
      await tx.cartItem.createMany({
        data: lines.map((line) => ({
          cartId: cart.id,
          productVariantId: line.productVariantId,
          quantity: line.quantity,
        })),
      })
      await tx.cart.update({
        where: { id: cart.id },
        data: { updatedAt: new Date() },
      })
    })

    return this.getCart(owner, locale)
  }

  async getCheckoutDraft(owner: CartOwner): Promise<{
    draft: CheckoutDraftV1 | null
    checkoutStartedAt: string | null
    updatedAt: string | null
  }> {
    const cart = await this.findCartByOwner(owner)
    if (!cart) {
      return { draft: null, checkoutStartedAt: null, updatedAt: null }
    }
    return {
      draft: parseStoredCheckoutDraft(cart.checkoutDraft),
      checkoutStartedAt: cart.checkoutStartedAt?.toISOString() ?? null,
      updatedAt: cart.updatedAt.toISOString(),
    }
  }

  async startCheckout(owner: CartOwner): Promise<{
    checkoutStartedAt: string
    updatedAt: string
  }> {
    const cart = await this.ensureCart(owner)
    if (cart.checkoutStartedAt) {
      return {
        checkoutStartedAt: cart.checkoutStartedAt.toISOString(),
        updatedAt: cart.updatedAt.toISOString(),
      }
    }

    const updated = await this.prisma.cart.update({
      where: { id: cart.id },
      data: { checkoutStartedAt: new Date() },
    })

    return {
      checkoutStartedAt: updated.checkoutStartedAt!.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    }
  }

  async upsertCheckoutDraft(owner: CartOwner, dto: UpdateCheckoutDraftDto) {
    const draft = normalizeCheckoutDraft({ v: 1, ...dto })
    if (!draft) {
      throw new BadRequestException('Некоректний чернетка оформлення.')
    }

    const cart = await this.ensureCart(owner)
    const updated = await this.prisma.cart.update({
      where: { id: cart.id },
      data: {
        checkoutDraft: draft as unknown as Prisma.InputJsonValue,
        ...(cart.checkoutStartedAt ? {} : { checkoutStartedAt: new Date() }),
      },
    })

    return {
      draft: parseStoredCheckoutDraft(updated.checkoutDraft),
      checkoutStartedAt: updated.checkoutStartedAt?.toISOString() ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    }
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
      return rows.map((row) => {
        const view = this.toCartLineView(row, typeOrder)
        const { imageUrl: _i, unitPrice: _u, lineTotal: _l, ...line } = view
        return line
      })
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
    const draftSelect = {
      id: true,
      checkoutDraft: true,
      checkoutStartedAt: true,
      updatedAt: true,
    } as const
    const guestCart = guestSessionId
      ? await this.prisma.cart.findUnique({
          where: { guestSessionId },
          select: draftSelect,
        })
      : null
    const userCart = await this.prisma.cart.findUnique({
      where: { userId },
      select: draftSelect,
    })

    // Resolve draft ownership before sync/delete so guest PII is not lost with the guest row.
    const draftOutcome = resolveCheckoutDraftAfterMerge({
      strategy,
      guestCart,
      userCart,
    })

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

    // clear strategy already wiped draft via clearCartContentsForOwner.
    if (strategy !== 'clear') {
      const owned = await this.findCartByOwner({ kind: 'user', userId })
      if (owned) {
        await this.prisma.cart.update({
          where: { id: owned.id },
          data: {
            checkoutDraft: draftOutcome.draft
              ? (draftOutcome.draft as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
            checkoutStartedAt: draftOutcome.checkoutStartedAt,
          },
        })
      }
    }

    if (guestCart) {
      await this.prisma.cartItem.deleteMany({ where: { cartId: guestCart.id } })
      await this.prisma.cart.delete({ where: { id: guestCart.id } })
    }

    if (res && guestSessionId) {
      this.clearGuestSessionCookie(res)
    }

    return this.getCart({ kind: 'user', userId }, locale)
  }

  private buildCheckoutDraftPiiMeta(
    cart: { checkoutDraft: Prisma.JsonValue | null; updatedAt: Date },
    now: Date,
  ): {
    hasCheckoutDraftPii: boolean
    piiCleanupAt: string | null
    piiStatus: CheckoutDraftPiiStatus
    piiRetentionDays: number
  } {
    const hasCheckoutDraftPii = parseStoredCheckoutDraft(cart.checkoutDraft) != null
    const cleanupAt = computeCheckoutDraftPiiCleanupAt({
      hasCheckoutDraft: hasCheckoutDraftPii,
      updatedAt: cart.updatedAt,
    })
    return {
      hasCheckoutDraftPii,
      piiCleanupAt: cleanupAt?.toISOString() ?? null,
      piiStatus: resolveCheckoutDraftPiiStatus({
        hasCheckoutDraft: hasCheckoutDraftPii,
        piiCleanupAt: cleanupAt,
        now,
      }),
      piiRetentionDays: CHECKOUT_DRAFT_PII_RETENTION_DAYS,
    }
  }

  private clearGuestSessionCookie(res: Response) {
    res.clearCookie(GUEST_CART_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })
  }

  private buildBackstageWhere(params: {
    search?: string
    kind?: 'guest' | 'user' | 'all'
    state?: BackstageCartStateFilter
    locale?: string
    updatedFrom?: string
    updatedTo?: string
    now?: Date
  }): Prisma.CartWhereInput {
    const now = params.now ?? new Date()
    const cutoff = abandonedCutoff(now)
    const kind = params.kind ?? 'all'
    const state = params.state ?? 'all'

    const where: Prisma.CartWhereInput = {
      items: { some: {} },
      ...(kind === 'guest' ? { userId: null, guestSessionId: { not: null } } : {}),
      ...(kind === 'user' ? { userId: { not: null } } : {}),
    }

    switch (state) {
      case 'active':
        where.updatedAt = { gte: cutoff }
        break
      case 'abandoned':
        where.updatedAt = { lt: cutoff }
        break
      case 'cart_only':
        where.checkoutStartedAt = null
        where.updatedAt = { gte: cutoff }
        break
      case 'checkout_started':
        where.checkoutStartedAt = { not: null }
        where.updatedAt = { gte: cutoff }
        break
      case 'cart_abandoned':
        where.checkoutStartedAt = null
        where.updatedAt = { lt: cutoff }
        break
      case 'checkout_abandoned':
        where.checkoutStartedAt = { not: null }
        where.updatedAt = { lt: cutoff }
        break
      default:
        break
    }

    if (params.updatedFrom || params.updatedTo) {
      const range: { gte?: Date; lte?: Date; lt?: Date } = {}
      if (
        typeof where.updatedAt === 'object' &&
        where.updatedAt &&
        !Array.isArray(where.updatedAt)
      ) {
        const existing = where.updatedAt as { gte?: Date; lte?: Date; lt?: Date }
        if (existing.gte) range.gte = existing.gte
        if (existing.lte) range.lte = existing.lte
        if (existing.lt) range.lt = existing.lt
      }
      if (params.updatedFrom) {
        const from = new Date(params.updatedFrom)
        if (!Number.isNaN(from.getTime())) range.gte = from
      }
      if (params.updatedTo) {
        const to = new Date(params.updatedTo)
        if (!Number.isNaN(to.getTime())) range.lte = to
      }
      where.updatedAt = range
    }

    if (params.locale?.trim()) {
      where.checkoutDraft = {
        path: ['locale'],
        equals: params.locale.trim().toLowerCase(),
      }
    }

    const search = params.search?.trim()
    if (search) {
      where.OR = [
        { guestSessionId: { contains: search, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ]
    }

    return where
  }

  /**
   * Current product subtotals from retail shelf prices (batch).
   * Not a full checkout quote (no delivery / COD / VAT fees).
   */
  private async batchProductSubtotals(
    carts: Array<{ id: string; items: Array<{ productVariantId: string; quantity: number }> }>,
  ): Promise<{ currency: string; byCartId: Map<string, number> }> {
    const currency = await this.commerce.getDefaultCurrencyCode()
    const variantIds = [
      ...new Set(carts.flatMap((cart) => cart.items.map((item) => item.productVariantId))),
    ]
    const byCartId = new Map<string, number>()
    if (!variantIds.length) return { currency, byCartId }

    const prices = await this.prisma.productPrice.findMany({
      where: {
        productVariantId: { in: variantIds },
        currency,
        priceType: RETAIL_PRICE_TYPE,
      },
      select: { productVariantId: true, value: true },
    })
    const priceByVariant = new Map(
      prices.map((row) => [row.productVariantId, Number(row.value)]),
    )

    for (const cart of carts) {
      let total = 0
      for (const item of cart.items) {
        const unit = priceByVariant.get(item.productVariantId)
        if (unit == null || Number.isNaN(unit)) continue
        total += unit * item.quantity
      }
      byCartId.set(cart.id, Math.round(total * 100) / 100)
    }

    return { currency, byCartId }
  }

  async listBackstage(params: {
    search?: string
    kind?: 'guest' | 'user' | 'all'
    state?: BackstageCartStateFilter
    locale?: string
    updatedFrom?: string
    updatedTo?: string
    page?: number
    pageSize?: number
  }) {
    const loc = 'uk'
    const typeOrder = await this.variantLabels.getTypeOrder()
    const page = Math.max(1, Math.floor(params.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 50)))
    const now = new Date()
    const where = this.buildBackstageWhere({ ...params, now })

    const [total, carts] = await this.prisma.$transaction([
      this.prisma.cart.count({ where }),
      this.prisma.cart.findMany({
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
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    const { currency, byCartId } = await this.batchProductSubtotals(carts)

    const items = carts.map((cart) => {
      const draftSummary = summarizeCheckoutDraft(cart.checkoutDraft)
      const state = classifyCartActivity({
        hasItems: cart._count.items > 0,
        checkoutStartedAt: cart.checkoutStartedAt,
        updatedAt: cart.updatedAt,
        now,
      }) as CartActivityState
      const draftName = [draftSummary.firstName, draftSummary.lastName]
        .filter(Boolean)
        .join(' ')
        .trim()
      const userName = cart.user
        ? [cart.user.firstName, cart.user.lastName].filter(Boolean).join(' ').trim() || null
        : null
      const pii = this.buildCheckoutDraftPiiMeta(cart, now)

      return {
        id: cart.id,
        kind: cart.userId ? ('user' as const) : ('guest' as const),
        state,
        activityBucket: cartActivityBucket(state),
        updatedAt: cart.updatedAt.toISOString(),
        createdAt: cart.createdAt.toISOString(),
        checkoutStartedAt: cart.checkoutStartedAt?.toISOString() ?? null,
        ageMs: Math.max(0, now.getTime() - cart.updatedAt.getTime()),
        itemCount: cart._count.items,
        totalQuantity: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        /** Current retail product subtotal (live prices); not full checkout grand total. */
        productsSubtotal: byCartId.get(cart.id) ?? 0,
        currency,
        productsSubtotalBasis: 'current_retail' as const,
        guestSessionId: cart.guestSessionId,
        user: cart.user
          ? {
              id: cart.user.id,
              name: userName,
              phone: cart.user.phone,
              email: cart.user.email,
            }
          : null,
        customerName: userName || draftName || null,
        customerEmail: cart.user?.email || draftSummary.email,
        customerPhone: cart.user?.phone || draftSummary.phone,
        locale: draftSummary.locale,
        siteCountryCode: draftSummary.countryCode,
        deliveryCountryCode: draftSummary.deliveryCountryCode,
        billingCountryCode: draftSummary.billingCountryCode,
        deliveryMethod: draftSummary.deliveryMethod,
        paymentMethod: draftSummary.paymentMethod,
        ...pii,
        items: cart.items.map((item) => {
          const view = this.toCartLineView(item, typeOrder)
          const { unitPrice: _u, lineTotal: _l, ...rest } = view
          return rest
        }),
      }
    })

    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    return { items, total, page, pageSize, totalPages }
  }

  async findBackstageOne(id: string) {
    const loc = 'uk'
    const typeOrder = await this.variantLabels.getTypeOrder()
    const now = new Date()
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

    if (!cart) {
      throw customerNotFound(CustomerErrorCode.CART_NOT_FOUND, 'Кошик не знайдено.')
    }

    const draft = parseStoredCheckoutDraft(cart.checkoutDraft)
    const draftSummary = summarizeCheckoutDraft(cart.checkoutDraft)
    const state = classifyCartActivity({
      hasItems: cart.items.length > 0,
      checkoutStartedAt: cart.checkoutStartedAt,
      updatedAt: cart.updatedAt,
      now,
    })

    const { currency, byCartId } = await this.batchProductSubtotals([cart])
    const productsSubtotal = byCartId.get(cart.id) ?? 0

    const prices = await this.prisma.productPrice.findMany({
      where: {
        productVariantId: { in: cart.items.map((i) => i.productVariantId) },
        currency,
        priceType: RETAIL_PRICE_TYPE,
      },
      select: { productVariantId: true, value: true },
    })
    const priceByVariant = new Map(
      prices.map((row) => [row.productVariantId, Number(row.value)]),
    )

    const userName = cart.user
      ? [cart.user.firstName, cart.user.lastName].filter(Boolean).join(' ').trim() || null
      : null
    const draftName = [draftSummary.firstName, draftSummary.lastName]
      .filter(Boolean)
      .join(' ')
      .trim()
    const pii = this.buildCheckoutDraftPiiMeta(cart, now)

    return {
      id: cart.id,
      kind: cart.userId ? ('user' as const) : ('guest' as const),
      state,
      activityBucket: cartActivityBucket(state),
      updatedAt: cart.updatedAt.toISOString(),
      createdAt: cart.createdAt.toISOString(),
      checkoutStartedAt: cart.checkoutStartedAt?.toISOString() ?? null,
      ageMs: Math.max(0, now.getTime() - cart.updatedAt.getTime()),
      guestSessionId: cart.guestSessionId,
      user: cart.user
        ? {
            id: cart.user.id,
            name: userName,
            phone: cart.user.phone,
            email: cart.user.email,
          }
        : null,
      /** Linked account profile (not deleted by checkoutDraft PII retention). */
      accountCustomer: cart.user
        ? {
            id: cart.user.id,
            name: userName,
            phone: cart.user.phone,
            email: cart.user.email,
          }
        : null,
      /** Saved checkout form PII from checkoutDraft (subject to 180-day retention). */
      savedCheckoutData: draft
        ? {
            name: draftName || null,
            email: draftSummary.email,
            phone: draftSummary.phone,
            companyLegalName: draft.companyLegalName ?? null,
            companyIco: draft.companyEdrpou ?? null,
            companyDic: draft.companyDic ?? null,
            companyVatId: draft.companyVatId ?? null,
            vatCountryCode: draft.vatCountryCode ?? null,
            buyerType: draft.buyerType ?? null,
          }
        : null,
      customer: {
        name: userName || draftName || null,
        email: cart.user?.email || draftSummary.email,
        phone: cart.user?.phone || draftSummary.phone,
        companyLegalName: draft?.companyLegalName ?? null,
        companyIco: draft?.companyEdrpou ?? null,
        companyDic: draft?.companyDic ?? null,
        companyVatId: draft?.companyVatId ?? null,
        vatCountryCode: draft?.vatCountryCode ?? null,
        buyerType: draft?.buyerType ?? null,
      },
      site: {
        countryCode: draftSummary.countryCode,
        locale: draftSummary.locale,
      },
      delivery: {
        countryCode: draftSummary.deliveryCountryCode,
        method: draftSummary.deliveryMethod,
        city: draft?.cityLabel || draft?.city || null,
        street: draft?.streetLabel || draft?.street || null,
        houseNumber: draft?.houseNumber || null,
        postalCode: draft?.postalCode || null,
        postOffice: draft?.postOffice || null,
        postOfficeLabel: draft?.postOfficeLabel || null,
        packetaPickupKind: draft?.packetaPickupKind || null,
        packetaCarrierId: draft?.packetaCarrierId ?? null,
        isOtherRecipient: draft?.isOtherRecipient ?? false,
        recipientName: draft?.isOtherRecipient
          ? [draft.recipientFirstName, draft.recipientLastName].filter(Boolean).join(' ').trim() ||
            null
          : null,
        recipientPhone: draft?.isOtherRecipient ? draft.recipientPhone || null : null,
        recipientCompanyName: draft?.recipientCompanyName || null,
      },
      billing: {
        countryCode: draftSummary.billingCountryCode,
        street: draft?.billingStreet || draft?.companyStreet || null,
        houseNumber: draft?.billingHouseNumber || null,
        city: draft?.billingCity || draft?.companyCity || null,
        postalCode: draft?.billingPostalCode || draft?.companyPostalCode || null,
      },
      payment: {
        method: draftSummary.paymentMethod,
      },
      productsSubtotal,
      currency,
      productsSubtotalBasis: 'current_retail' as const,
      ...pii,
      draft,
      items: cart.items.map((item) => {
        const view = this.toCartLineView(item, typeOrder)
        const unitPrice = priceByVariant.get(item.productVariantId) ?? null
        const lineTotal =
          unitPrice != null ? Math.round(unitPrice * item.quantity * 100) / 100 : null
        return {
          ...view,
          unitPrice,
          lineTotal,
        }
      }),
    }
  }
}
