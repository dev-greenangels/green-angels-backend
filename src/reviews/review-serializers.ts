import { ReviewStatus, ReviewVerificationType } from '@prisma/client'

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
    translations: Array<{ name: string }>
  } | null
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

export function toPublicReviewListItem(review: ReviewSerializeInput): PublicReviewListItem {
  const images = resolveImages(review)
  return {
    id: review.id,
    authorName: review.authorName,
    text: review.text,
    image: images[0] ?? null,
    images,
    rating: review.rating,
    productId: review.productId,
    productName: review.product?.translations[0]?.name ?? null,
    productSlug: review.product?.slug ?? null,
    status: review.status,
    verificationType: review.verificationType ?? ReviewVerificationType.NONE,
    purchasedVariantLabels: review.purchasedVariantLabels ?? [],
    storeReply: buildStoreReply(review),
    submissionGroupId: review.orderId?.trim() || null,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  }
}

export function toBackstageReviewListItem(review: ReviewSerializeInput): BackstageReviewListItem {
  return {
    ...toPublicReviewListItem(review),
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
