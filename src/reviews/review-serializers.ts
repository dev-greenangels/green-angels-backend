import { ReviewStatus, ReviewVerificationType } from '@prisma/client'

import { pickLocalizedName } from '../i18n/pick-localized-name'

export type ReviewStoreReplyDto = {
  authorName: string
  text: string
  createdAt: string
}

/** Public storefront / catalog review payload — no author PII or import internals. */
export type PublicReviewListItem = {
  id: string
  authorName: string
  text: string
  image: string | null
  images: string[]
  rating: number
  productId: string | null
  productName: string | null
  productSlug: string | null
  status: ReviewStatus
  verificationType: ReviewVerificationType
  purchasedVariantLabels: string[]
  storeReply: ReviewStoreReplyDto | null
  /**
   * Opaque key shared by reviews from the same order submission.
   * Used only for UI grouping — not an order number / PII field name.
   */
  submissionGroupId: string | null
  /**
   * ISO 3166-1 alpha-2 delivery destination from the linked Order snapshot.
   * Null when no order / unknown — never billing, locale, or IP.
   */
  deliveryCountryCode: string | null
  createdAt: string
  updatedAt: string
}

/** Backstage review payload — includes contact + legacy import + audit evidence. */
export type BackstageReviewListItem = PublicReviewListItem & {
  email: string | null
  phone: string | null
  legacyId: string | null
  legacySource: string | null
  importedAt: string | null
  orderId: string | null
}

export type ReviewSerializeInput = {
  id: string
  authorName: string
  email: string | null
  phone: string | null
  text: string
  image: string | null
  images: string[]
  rating: number
  productId: string | null
  orderId?: string | null
  verificationType?: ReviewVerificationType | null
  purchasedVariantLabels?: string[] | null
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
    latinName?: string | null
    translations: Array<{ locale?: string; name: string }>
  } | null
  order?: {
    deliveryCountryCode?: string | null
  } | null
}

const DEFAULT_PUBLIC_LOCALE = 'uk'

function resolveProductName(
  product: NonNullable<ReviewSerializeInput['product']>,
  locale: string,
): string {
  return pickLocalizedName(product.translations, locale, product.slug, {
    latinName: product.latinName,
  })
}

const PUBLIC_FORBIDDEN_KEYS = [
  'email',
  'phone',
  'userId',
  'legacyId',
  'legacySource',
  'importedAt',
  'orderId',
  'orderItemId',
] as const

function resolveImages(review: Pick<ReviewSerializeInput, 'image' | 'images'>): string[] {
  if (review.images?.length) return review.images
  return review.image ? [review.image] : []
}

function buildStoreReply(review: ReviewSerializeInput): ReviewStoreReplyDto | null {
  const text = review.storeReplyText?.trim()
  if (!text) return null
  return {
    authorName: review.storeReplyAuthorName?.trim() || '',
    text,
    createdAt: (review.storeReplyAt ?? review.updatedAt).toISOString(),
  }
}

/** Normalize Order.deliveryCountryCode → public ISO alpha-2 (or null). */
export function normalizeDeliveryCountryCode(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim().toUpperCase() ?? ''
  if (!/^[A-Z]{2}$/.test(trimmed)) return null
  return trimmed
}

export function toPublicReviewListItem(
  review: ReviewSerializeInput,
  locale: string = DEFAULT_PUBLIC_LOCALE,
): PublicReviewListItem {
  const images = resolveImages(review)
  const resolvedLocale = locale.trim() || DEFAULT_PUBLIC_LOCALE
  return {
    id: review.id,
    authorName: review.authorName,
    text: review.text,
    image: images[0] ?? null,
    images,
    rating: review.rating,
    productId: review.productId,
    productName: review.product ? resolveProductName(review.product, resolvedLocale) : null,
    productSlug: review.product?.slug ?? null,
    status: review.status,
    verificationType: review.verificationType ?? ReviewVerificationType.NONE,
    purchasedVariantLabels: review.purchasedVariantLabels ?? [],
    storeReply: buildStoreReply(review),
    submissionGroupId: review.orderId?.trim() || null,
    deliveryCountryCode: normalizeDeliveryCountryCode(
      review.order?.deliveryCountryCode,
    ),
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  }
}

export function toBackstageReviewListItem(
  review: ReviewSerializeInput,
  locale: string = DEFAULT_PUBLIC_LOCALE,
): BackstageReviewListItem {
  return {
    ...toPublicReviewListItem(review, locale),
    email: review.email,
    phone: review.phone,
    legacyId: review.legacyId,
    legacySource: review.legacySource,
    importedAt: review.importedAt?.toISOString() ?? null,
    orderId: review.orderId ?? null,
  }
}

/** Assert public DTO never carries author PII / internal evidence keys. */
export function assertPublicReviewContract(item: Record<string, unknown>): void {
  for (const key of PUBLIC_FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(item, key)) {
      throw new Error(`Public review must not expose "${key}"`)
    }
  }
}
