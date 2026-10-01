import {
  BadRequestException,
  Injectable,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import type { Request, Response } from 'express'
import { randomUUID } from 'crypto'

import { RETAIL_PRICE_TYPE } from '../commerce/commerce.constants'
import { CommerceService } from '../commerce/commerce.service'
import { convertEurToHuf } from '../pricing/tax-regime'
import { toShelfUnitPrice, resolveShelfTaxRate } from '../pricing/vat-price'
import { VariantLabelService } from '../products/variant-label.service'
import { VARIANT_LABEL_ATTRIBUTE_SELECT } from '../products/variant-label.util'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import { DEFAULT_COUNTRY_SITES } from '../settings/market.types'
import {
  CustomerErrorCode,
  customerBadRequest,
  customerNotFound,
} from '../common/customer-error'
import { deriveCartCheckoutProgress } from './cart-checkout-progress'
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
  applySourceContextSetOnce,
  cartSourceFieldsFromRow,
  isCartCountrySiteCode,
  normalizeCartSourceContext,
  resolveSourceContextAfterMerge,
  type CartSourceContext,
  type CartSourceContextInput,
} from './cart-source-context'
import {
  normalizeCheckoutDraft,
  parseStoredCheckoutDraft,
  resolveBackstageCheckoutTotals,
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
  | 'converted'

@Injectable()
export class CartsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly variantLabels: VariantLabelService,
    private readonly commerce: CommerceService,
    private readonly settings: SettingsService,
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

  private isUniqueConflict(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  }

  /**
   * Current OPEN cart only (closedAt IS NULL). Historical closed carts never returned.
   */
  async findOpenCartByOwner(owner: CartOwner) {
    if (owner.kind === 'user') {
      return this.prisma.cart.findFirst({
        where: { userId: owner.userId, closedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
    }
    return this.prisma.cart.findFirst({
      where: { guestSessionId: owner.guestSessionId, closedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  }

  /** @deprecated alias — all current-cart paths use open cart only */
  private async findCartByOwner(owner: CartOwner) {
    return this.findOpenCartByOwner(owner)
  }

  /**
   * Empty OPEN cart contents + clear checkout draft/start markers.
   * Preserves origin source context. Does not close the cart.
   * No stock mutations. Idempotent when cart already empty / missing.
   */
  async clearCartContentsForOwner(owner: CartOwner): Promise<{ cleared: boolean }> {
    const cart = await this.findOpenCartByOwner(owner)
    if (!cart) return { cleared: false }
    return this.clearCartContentsById(cart.id)
  }

  /**
   * Exact-cart clear (items + draft + checkoutStartedAt). Preserves origin + closedAt.
   * Used by post-order close and owner clear.
   */
  async clearCartContentsById(cartId: string): Promise<{ cleared: boolean }> {
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      select: { id: true },
    })
    if (!cart) return { cleared: false }

    await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.deleteMany({ where: { cartId } })
      await tx.cart.update({
        where: { id: cartId },
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
   * Close originating Cart for a durable Order (Option A).
   * Targets exact cartId — never the owner's later open cart.
   * Sets Order.cartId if missing; sets closedAt once; clears items/draft/start.
   * Idempotent for the same orderId + cartId.
   */
  async closeCartForOrder(
    cartId: string,
    orderId: string,
  ): Promise<{ closed: boolean; reason?: string }> {
    const [cart, order] = await Promise.all([
      this.prisma.cart.findUnique({
        where: { id: cartId },
        select: { id: true, closedAt: true },
      }),
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, cartId: true },
      }),
    ])
    if (!cart) return { closed: false, reason: 'missing_cart' }
    if (!order) return { closed: false, reason: 'missing_order' }
    if (order.cartId && order.cartId !== cartId) {
      return { closed: false, reason: 'order_linked_other_cart' }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (!order.cartId) {
          await tx.order.update({
            where: { id: orderId },
            data: { cartId },
          })
        }
        await tx.cartItem.deleteMany({ where: { cartId } })
        await tx.cart.update({
          where: { id: cartId },
          data: {
            checkoutDraft: Prisma.DbNull,
            checkoutStartedAt: null,
            closedAt: cart.closedAt ?? new Date(),
            updatedAt: new Date(),
          },
        })
      })
      return { closed: true, reason: cart.closedAt ? 'already_closed' : undefined }
    } catch (err) {
      if (this.isUniqueConflict(err)) {
        // Order.cartId unique race — re-read and confirm same link.
        const again = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: { cartId: true },
        })
        if (again?.cartId === cartId) {
          await this.clearCartContentsById(cartId)
          if (!cart.closedAt) {
            await this.prisma.cart.update({
              where: { id: cartId },
              data: { closedAt: new Date() },
            })
          }
          return { closed: true, reason: 'race_same' }
        }
        return { closed: false, reason: 'order_linked_other_cart' }
      }
      throw err
    }
  }

  /**
   * Resolve Cart origin currency for a country-site.
   * Same authority as storefront applyCountrySiteOverlay:
   * market.countrySites (enabled) → DEFAULT_COUNTRY_SITES → deploy default.
   * Metadata only — not checkout/Order pricing authority.
   */
  private async resolveCurrencyForCountrySite(
    countrySiteCode: string | null,
  ): Promise<string> {
    const deployDefault = await this.commerce.getDefaultCurrencyCode()
    if (!countrySiteCode) return deployDefault
    try {
      const market = await this.settings.getMarketSettings()
      if (market.region !== 'sk') return deployDefault
      const site =
        market.countrySites.find((s) => s.code === countrySiteCode && s.enabled) ??
        DEFAULT_COUNTRY_SITES.find((s) => s.code === countrySiteCode) ??
        null
      if (site?.currency) return site.currency.toUpperCase()
    } catch {
      // soft-degrade to deploy default
    }
    return deployDefault
  }

  private async enrichSourceContext(
    input: CartSourceContextInput | null | undefined,
  ): Promise<CartSourceContext> {
    const normalized = normalizeCartSourceContext(input)
    const hasAny =
      Boolean(normalized.countrySiteCode) ||
      Boolean(normalized.sourceHost) ||
      Boolean(normalized.locale) ||
      Boolean(normalized.currencyCode)
    if (!hasAny) {
      return normalized
    }
    if (normalized.currencyCode) return normalized
    const currency = await this.resolveCurrencyForCountrySite(normalized.countrySiteCode)
    return {
      ...normalized,
      currencyCode: normalizeCartSourceContext({ currencyCode: currency }).currencyCode,
    }
  }

  private async applySourceContextSetOnceToCart(
    cartId: string,
    existing: CartSourceContext,
    incoming: CartSourceContextInput | null | undefined,
  ): Promise<void> {
    const enriched = await this.enrichSourceContext(incoming)
    const hasIncoming =
      Boolean(enriched.countrySiteCode) ||
      Boolean(enriched.sourceHost) ||
      Boolean(enriched.locale) ||
      Boolean(enriched.currencyCode)
    if (!hasIncoming) return
    const merged = applySourceContextSetOnce(existing, enriched)
    if (!merged.changed) return
    await this.prisma.cart.update({
      where: { id: cartId },
      data: {
        countrySiteCode: merged.countrySiteCode,
        sourceHost: merged.sourceHost,
        locale: merged.locale,
        currencyCode: merged.currencyCode,
      },
    })
  }

  private async ensureCart(
    owner: CartOwner,
    source?: CartSourceContextInput | null,
  ) {
    const existing = await this.findOpenCartByOwner(owner)
    if (existing) {
      await this.applySourceContextSetOnceToCart(
        existing.id,
        cartSourceFieldsFromRow(existing),
        source,
      )
      const refreshed = await this.findOpenCartByOwner(owner)
      return refreshed!
    }

    const enriched = await this.enrichSourceContext(source)
    // On create, always stamp display currency (deploy/site) even if host unknown.
    const currencyCode =
      enriched.currencyCode ??
      (await this.resolveCurrencyForCountrySite(enriched.countrySiteCode))
    const createData =
      owner.kind === 'user'
        ? {
            userId: owner.userId,
            countrySiteCode: enriched.countrySiteCode,
            sourceHost: enriched.sourceHost,
            locale: enriched.locale,
            currencyCode,
          }
        : {
            guestSessionId: owner.guestSessionId,
            countrySiteCode: enriched.countrySiteCode,
            sourceHost: enriched.sourceHost,
            locale: enriched.locale,
            currencyCode,
          }

    try {
      return await this.prisma.cart.create({ data: createData })
    } catch (err) {
      // Partial unique: concurrent ensure — re-read the winner open cart.
      if (!this.isUniqueConflict(err)) throw err
      const raced = await this.findOpenCartByOwner(owner)
      if (!raced) throw err
      await this.applySourceContextSetOnceToCart(
        raced.id,
        cartSourceFieldsFromRow(raced),
        source,
      )
      return (await this.findOpenCartByOwner(owner))!
    }
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

  async syncCart(
    owner: CartOwner,
    dto: SyncCartDto,
    locale?: string,
    source?: CartSourceContextInput | null,
  ) {
    const lines = this.normalizeLines(dto.items)
    const variantIds = lines.map((line) => line.productVariantId)
    await this.assertValidVariantIds(variantIds)

    const sourceWithLocale: CartSourceContextInput = {
      ...source,
      locale: source?.locale ?? locale,
    }

    if (!lines.length) {
      await this.clearCartContentsForOwner(owner)
      // ensureCart is unnecessary for empty sync when cart missing — getCart returns [].
      const existing = await this.findCartByOwner(owner)
      if (!existing) return { items: [] as CartLineView[] }
      // Set-once origin fill for historical empty carts that somehow exist.
      await this.applySourceContextSetOnceToCart(
        existing.id,
        cartSourceFieldsFromRow(existing),
        sourceWithLocale,
      )
      return this.getCart(owner, locale)
    }

    const cart = await this.ensureCart(owner, sourceWithLocale)

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

  async startCheckout(
    owner: CartOwner,
    source?: CartSourceContextInput | null,
  ): Promise<{
    checkoutStartedAt: string
    updatedAt: string
  }> {
    const cart = await this.ensureCart(owner, source)
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

  async upsertCheckoutDraft(
    owner: CartOwner,
    dto: UpdateCheckoutDraftDto,
    source?: CartSourceContextInput | null,
  ) {
    const draft = normalizeCheckoutDraft({ v: 1, ...dto })
    if (!draft) {
      throw new BadRequestException('Некоректний чернетка оформлення.')
    }

    const cart = await this.ensureCart(owner, source)
    // Preserve informational lastQuote when a form-only PATCH omits it
    // (storefront must never lose BO snapshot just because quote briefly unloaded).
    if (!draft.lastQuote) {
      const previous = parseStoredCheckoutDraft(cart.checkoutDraft)?.lastQuote
      if (previous) draft.lastQuote = previous
    }
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
        ? this.findOpenCartByOwner({ kind: 'guest', guestSessionId })
        : Promise.resolve(null),
      this.findOpenCartByOwner({ kind: 'user', userId }),
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
    source?: CartSourceContextInput | null,
  ) {
    const preview = await this.getMergePreview(userId, guestSessionId, locale)
    const sourceSelect = {
      id: true,
      checkoutDraft: true,
      checkoutStartedAt: true,
      updatedAt: true,
      countrySiteCode: true,
      sourceHost: true,
      locale: true,
      currencyCode: true,
      closedAt: true,
    } as const
    const guestCart = guestSessionId
      ? await this.prisma.cart.findFirst({
          where: { guestSessionId, closedAt: null },
          select: sourceSelect,
        })
      : null
    const userCart = await this.prisma.cart.findFirst({
      where: { userId, closedAt: null },
      select: sourceSelect,
    })

    // Resolve draft ownership before sync/delete so guest PII is not lost with the guest row.
    const draftOutcome = resolveCheckoutDraftAfterMerge({
      strategy,
      guestCart,
      userCart,
    })

    const sourceOutcome = resolveSourceContextAfterMerge({
      strategy,
      guest: guestCart ? cartSourceFieldsFromRow(guestCart) : null,
      user: userCart ? cartSourceFieldsFromRow(userCart) : null,
    })

    /**
     * KEEP_GUEST: reassign guest OPEN cart to the user (preserves attempt id/origin).
     * Dispose the user's previous OPEN cart only (historical closed carts untouched).
     */
    if (strategy === 'keep_guest' && guestCart) {
      await this.prisma.$transaction(async (tx) => {
        if (userCart && userCart.id !== guestCart.id) {
          await tx.cartItem.deleteMany({ where: { cartId: userCart.id } })
          await tx.cart.delete({ where: { id: userCart.id } })
        }
        await tx.cart.update({
          where: { id: guestCart.id },
          data: {
            userId,
            guestSessionId: null,
            checkoutDraft: draftOutcome.draft
              ? (draftOutcome.draft as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
            checkoutStartedAt: draftOutcome.checkoutStartedAt,
            ...(sourceOutcome
              ? {
                  countrySiteCode: sourceOutcome.countrySiteCode,
                  sourceHost: sourceOutcome.sourceHost,
                  locale: sourceOutcome.locale,
                  currencyCode: sourceOutcome.currencyCode,
                }
              : {}),
          },
        })
      })

      if (res && guestSessionId) {
        this.clearGuestSessionCookie(res)
      }
      return this.getCart({ kind: 'user', userId }, locale)
    }

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

    // Pass request source only as set-once fill for brand-new user carts; merge
    // outcome below overwrites origin from guest/user cart semantics.
    await this.syncCart(
      { kind: 'user', userId },
      { items: nextItems },
      locale,
      source,
    )

    // clear strategy already wiped draft via clearCartContentsForOwner.
    if (strategy !== 'clear') {
      const owned = await this.findOpenCartByOwner({ kind: 'user', userId })
      if (owned) {
        await this.prisma.cart.update({
          where: { id: owned.id },
          data: {
            checkoutDraft: draftOutcome.draft
              ? (draftOutcome.draft as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
            checkoutStartedAt: draftOutcome.checkoutStartedAt,
            ...(sourceOutcome
              ? {
                  countrySiteCode: sourceOutcome.countrySiteCode,
                  sourceHost: sourceOutcome.sourceHost,
                  locale: sourceOutcome.locale,
                  currencyCode: sourceOutcome.currencyCode,
                }
              : {}),
          },
        })
      }
    }

    // Dispose guest OPEN cart only (historical guest carts untouched).
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
      ...(kind === 'guest' ? { userId: null, guestSessionId: { not: null } } : {}),
      ...(kind === 'user' ? { userId: { not: null } } : {}),
    }

    // Active/abandoned = OPEN carts with items; converted = closed attempts (historical).
    if (state === 'converted') {
      where.closedAt = { not: null }
    } else if (state === 'all') {
      where.OR = [{ items: { some: {} }, closedAt: null }, { closedAt: { not: null } }]
    } else {
      where.items = { some: {} }
      where.closedAt = null
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
      case 'converted':
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
      const loc = params.locale.trim().toLowerCase()
      const localeClause: Prisma.CartWhereInput[] = [
        { locale: loc },
        { checkoutDraft: { path: ['locale'], equals: loc } },
      ]
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: localeClause }]
        delete where.OR
      } else {
        where.OR = localeClause
      }
    }

    const search = params.search?.trim()
    if (search) {
      const orderNumber = Number(search)
      const searchClause: Prisma.CartWhereInput[] = [
        { guestSessionId: { contains: search, mode: 'insensitive' } },
        { sourceHost: { contains: search, mode: 'insensitive' } },
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
        {
          order: {
            OR: [
              { id: { equals: search } },
              ...(Number.isFinite(orderNumber) && search.trim() !== ''
                ? [{ orderNumber }]
                : []),
            ],
          },
        },
      ]
      if (where.AND) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : [where.AND]),
          { OR: searchClause },
        ]
      } else if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchClause }]
        delete where.OR
      } else {
        where.OR = searchClause
      }
    }

    return where
  }

  /**
   * Current retail merchandise estimate using the same shelf pipeline as storefront:
   * ProductPrice → toShelfUnitPrice → (HUF FX per unit) → × qty.
   * Not a historical snapshot and not a checkout grand total.
   */
  private async batchProductSubtotals(
    carts: Array<{
      id: string
      currencyCode: string | null
      countrySiteCode: string | null
      items: Array<{ productVariantId: string; quantity: number }>
    }>,
  ): Promise<{
    byCartId: Map<string, { productsSubtotal: number; currency: string }>
  }> {
    const deployDefault = await this.commerce.getDefaultCurrencyCode()
    const market = await this.settings.getMarketSettings().catch(() => null)
    const cartCheckout = await this.settings.getCartCheckoutSettings().catch(() => null)
    const eurToHufRate =
      market?.eurToHufRate && market.eurToHufRate > 0 ? market.eurToHufRate : 400
    const fallbackTax =
      cartCheckout?.taxRatePercent && cartCheckout.taxRatePercent > 0
        ? cartCheckout.taxRatePercent
        : market?.sellerTaxRatePercent && market.sellerTaxRatePercent > 0
          ? market.sellerTaxRatePercent
          : 0

    const variantIds = [
      ...new Set(carts.flatMap((cart) => cart.items.map((item) => item.productVariantId))),
    ]
    const byCartId = new Map<string, { productsSubtotal: number; currency: string }>()
    if (!variantIds.length) {
      for (const cart of carts) {
        byCartId.set(cart.id, {
          productsSubtotal: 0,
          currency: (cart.currencyCode || deployDefault).toUpperCase(),
        })
      }
      return { byCartId }
    }

    const prices = await this.prisma.productPrice.findMany({
      where: {
        productVariantId: { in: variantIds },
        currency: deployDefault,
        priceType: RETAIL_PRICE_TYPE,
      },
      select: { productVariantId: true, value: true },
    })
    const priceByVariant = new Map(
      prices.map((row) => [row.productVariantId, Number(row.value)]),
    )

    for (const cart of carts) {
      const displayCurrency = (cart.currencyCode || deployDefault).toUpperCase()
      const countryCode =
        cart.countrySiteCode && isCartCountrySiteCode(cart.countrySiteCode)
          ? cart.countrySiteCode
          : null
      const taxRatePercent = market
        ? resolveShelfTaxRate(market, countryCode, fallbackTax)
        : fallbackTax
      const priceBasis = market?.priceBasis ?? 'inc_vat'
      const primary = market?.storefrontPrimaryPrice ?? 'inc_vat'

      let total = 0
      for (const item of cart.items) {
        const stored = priceByVariant.get(item.productVariantId)
        if (stored == null || Number.isNaN(stored)) continue
        let shelfUnit = toShelfUnitPrice(stored, {
          priceBasis,
          primary,
          ratePercent: taxRatePercent,
        })
        if (displayCurrency === 'HUF' && deployDefault !== 'HUF') {
          shelfUnit = convertEurToHuf(shelfUnit, eurToHufRate)
        }
        total += shelfUnit * item.quantity
      }
      byCartId.set(cart.id, {
        productsSubtotal:
          displayCurrency === 'HUF' ? Math.round(total) : Math.round(total * 100) / 100,
        currency: displayCurrency,
      })
    }

    return { byCartId }
  }

  private formatOrderNumber(orderNumber: number): string {
    return `ZY-${String(orderNumber).padStart(8, '0')}`
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
          order: {
            select: {
              id: true,
              orderNumber: true,
              deliveryAmount: true,
              packagingAmount: true,
              taxAmount: true,
              productsSubtotal: true,
              totalAmount: true,
              currency: true,
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

    const { byCartId } = await this.batchProductSubtotals(carts)
    const deployDefault = await this.commerce.getDefaultCurrencyCode()

    const items = carts.map((cart) => {
      const draftSummary = summarizeCheckoutDraft(cart.checkoutDraft)
      const checkoutTotals = resolveBackstageCheckoutTotals({
        order: cart.order,
        checkoutDraft: cart.checkoutDraft,
      })
      const convertedOrderId = cart.order?.id ?? null
      const state = classifyCartActivity({
        hasItems: cart._count.items > 0,
        checkoutStartedAt: cart.checkoutStartedAt,
        updatedAt: cart.updatedAt,
        now,
        closedAt: cart.closedAt,
        orderId: convertedOrderId,
      }) as CartActivityState
      const draftName = [draftSummary.firstName, draftSummary.lastName]
        .filter(Boolean)
        .join(' ')
        .trim()
      const userName = cart.user
        ? [cart.user.firstName, cart.user.lastName].filter(Boolean).join(' ').trim() || null
        : null
      const pii = this.buildCheckoutDraftPiiMeta(cart, now)
      const money = byCartId.get(cart.id) ?? {
        productsSubtotal: 0,
        currency: (cart.currencyCode || deployDefault).toUpperCase(),
      }
      const checkoutProgress = deriveCartCheckoutProgress({
        hasItems: cart._count.items > 0,
        checkoutStartedAt: cart.checkoutStartedAt,
        checkoutDraft: cart.checkoutDraft,
        closedAt: cart.closedAt,
        orderId: convertedOrderId,
        account: cart.user,
      })

      return {
        id: cart.id,
        kind: cart.userId ? ('user' as const) : ('guest' as const),
        state,
        activityBucket: cartActivityBucket(state),
        checkoutProgress,
        updatedAt: cart.updatedAt.toISOString(),
        createdAt: cart.createdAt.toISOString(),
        checkoutStartedAt: cart.checkoutStartedAt?.toISOString() ?? null,
        closedAt: cart.closedAt?.toISOString() ?? null,
        ageMs: Math.max(0, now.getTime() - cart.updatedAt.getTime()),
        itemCount: cart._count.items,
        totalQuantity: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        /** Current retail merchandise estimate in Cart.currencyCode; not checkout grand total. */
        productsSubtotal: money.productsSubtotal,
        currency: money.currency,
        productsSubtotalBasis: 'current_retail' as const,
        checkoutDeliveryAmount: checkoutTotals.deliveryAmount,
        checkoutGrandTotal: checkoutTotals.grandTotal,
        checkoutTotalsCurrency: checkoutTotals.currencyCode,
        checkoutTotalsBasis: checkoutTotals.basis,
        checkoutQuoteQuotedAt: checkoutTotals.quotedAt,
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
        /** Origin/storefront context (first-class Cart fields). */
        countrySiteCode: cart.countrySiteCode,
        sourceHost: cart.sourceHost,
        /** Captured Cart origin locale only — never draft fallback. */
        locale: cart.locale,
        /** Captured Cart origin currency only — never deploy-default invention. */
        currencyCode: cart.currencyCode,
        /** Checkout-draft context (not immutable origin). */
        checkoutDraftCountryCode: draftSummary.countryCode,
        checkoutDraftLocale: draftSummary.locale,
        /** @deprecated Prefer countrySiteCode; no longer falls back to draft. */
        siteCountryCode: cart.countrySiteCode,
        deliveryCountryCode: draftSummary.deliveryCountryCode,
        billingCountryCode: draftSummary.billingCountryCode,
        deliveryMethod: draftSummary.deliveryMethod,
        paymentMethod: draftSummary.paymentMethod,
        convertedOrderId,
        convertedAt: cart.closedAt?.toISOString() ?? null,
        convertedOrder: cart.order
          ? {
              id: cart.order.id,
              orderNumber: cart.order.orderNumber,
              orderNumberFormatted: this.formatOrderNumber(cart.order.orderNumber),
            }
          : null,
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
        order: {
          select: {
            id: true,
            orderNumber: true,
            deliveryAmount: true,
            packagingAmount: true,
            taxAmount: true,
            productsSubtotal: true,
            totalAmount: true,
            currency: true,
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
    const checkoutTotals = resolveBackstageCheckoutTotals({
      order: cart.order,
      checkoutDraft: cart.checkoutDraft,
    })
    const convertedOrderId = cart.order?.id ?? null
    const state = classifyCartActivity({
      hasItems: cart.items.length > 0,
      checkoutStartedAt: cart.checkoutStartedAt,
      updatedAt: cart.updatedAt,
      now,
      closedAt: cart.closedAt,
      orderId: convertedOrderId,
    })

    const { byCartId } = await this.batchProductSubtotals([cart])
    const deployDefault = await this.commerce.getDefaultCurrencyCode()
    const money = byCartId.get(cart.id) ?? {
      productsSubtotal: 0,
      currency: (cart.currencyCode || deployDefault).toUpperCase(),
    }
    const productsSubtotal = money.productsSubtotal
    const currency = money.currency

    const market = await this.settings.getMarketSettings().catch(() => null)
    const eurToHufRate =
      market?.eurToHufRate && market.eurToHufRate > 0 ? market.eurToHufRate : 400

    const prices = await this.prisma.productPrice.findMany({
      where: {
        productVariantId: { in: cart.items.map((i) => i.productVariantId) },
        currency: deployDefault,
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
    const checkoutProgress = deriveCartCheckoutProgress({
      hasItems: cart.items.length > 0,
      checkoutStartedAt: cart.checkoutStartedAt,
      checkoutDraft: cart.checkoutDraft,
      closedAt: cart.closedAt,
      orderId: convertedOrderId,
      account: cart.user,
    })

    return {
      id: cart.id,
      kind: cart.userId ? ('user' as const) : ('guest' as const),
      state,
      activityBucket: cartActivityBucket(state),
      checkoutProgress,
      updatedAt: cart.updatedAt.toISOString(),
      createdAt: cart.createdAt.toISOString(),
      checkoutStartedAt: cart.checkoutStartedAt?.toISOString() ?? null,
      closedAt: cart.closedAt?.toISOString() ?? null,
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
      accountCustomer: cart.user
        ? {
            id: cart.user.id,
            name: userName,
            phone: cart.user.phone,
            email: cart.user.email,
          }
        : null,
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
        /** Captured origin country-site only. */
        countryCode: cart.countrySiteCode,
        countrySiteCode: cart.countrySiteCode,
        sourceHost: cart.sourceHost,
        locale: cart.locale,
        currencyCode: cart.currencyCode,
        /** Checkout-draft context (not origin). */
        checkoutDraftCountryCode: draftSummary.countryCode,
        checkoutDraftLocale: draftSummary.locale,
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
      convertedOrderId,
      convertedAt: cart.closedAt?.toISOString() ?? null,
      convertedOrder: cart.order
        ? {
            id: cart.order.id,
            orderNumber: cart.order.orderNumber,
            orderNumberFormatted: this.formatOrderNumber(cart.order.orderNumber),
          }
        : null,
      productsSubtotal,
      currency,
      productsSubtotalBasis: 'current_retail' as const,
      checkoutDeliveryAmount: checkoutTotals.deliveryAmount,
      checkoutGrandTotal: checkoutTotals.grandTotal,
      checkoutTotalsCurrency: checkoutTotals.currencyCode,
      checkoutTotalsBasis: checkoutTotals.basis,
      checkoutQuoteQuotedAt: checkoutTotals.quotedAt,
      ...pii,
      draft,
      items: cart.items.map((item) => {
        const view = this.toCartLineView(item, typeOrder)
        const stored = priceByVariant.get(item.productVariantId) ?? null
        let unitPrice: number | null = stored
        if (unitPrice != null && market) {
          const countryCode =
            cart.countrySiteCode && isCartCountrySiteCode(cart.countrySiteCode)
              ? cart.countrySiteCode
              : null
          const taxRatePercent = resolveShelfTaxRate(
            market,
            countryCode,
            market.sellerTaxRatePercent || 0,
          )
          unitPrice = toShelfUnitPrice(unitPrice, {
            priceBasis: market.priceBasis,
            primary: market.storefrontPrimaryPrice,
            ratePercent: taxRatePercent,
          })
        }
        if (unitPrice != null && currency === 'HUF' && deployDefault !== 'HUF') {
          unitPrice = convertEurToHuf(unitPrice, eurToHufRate)
        }
        const lineTotal =
          unitPrice != null
            ? currency === 'HUF'
              ? Math.round(unitPrice * item.quantity)
              : Math.round(unitPrice * item.quantity * 100) / 100
            : null
        return {
          ...view,
          unitPrice,
          lineTotal,
        }
      }),
    }
  }
}
