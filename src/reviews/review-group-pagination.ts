/**
 * Submission-group pagination for public review lists.
 *
 * A group key is `orderId` when present, otherwise the standalone review `id`.
 * pageSize / total count groups (display cards), not raw Review rows.
 */

export type ReviewGroupStub = {
  id: string
  orderId: string | null
  productId: string | null
  createdAt: Date
  rating: number
}

export type ReviewGroupSort = 'newest' | 'oldest' | 'rating_desc' | 'rating_asc'

export type SubmissionGroupPage = {
  /** Ordered group keys for the requested page. */
  groupKeys: string[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  /** orderId values among groupKeys (shared by multiple reviews). */
  orderIds: string[]
  /** Standalone review ids (group key === review id, no orderId). */
  standaloneIds: string[]
}

export function submissionGroupKey(stub: Pick<ReviewGroupStub, 'id' | 'orderId'>): string {
  const orderId = stub.orderId?.trim()
  return orderId || stub.id
}

type InternalGroup = {
  key: string
  stubs: ReviewGroupStub[]
  isOrderGroup: boolean
  newestAt: number
  oldestAt: number
  /** Store rating if present, else max product rating. */
  primaryRating: number
}

function buildGroups(stubs: ReviewGroupStub[]): InternalGroup[] {
  const byKey = new Map<string, ReviewGroupStub[]>()
  for (const stub of stubs) {
    const key = submissionGroupKey(stub)
    const bucket = byKey.get(key)
    if (bucket) bucket.push(stub)
    else byKey.set(key, [stub])
  }

  const groups: InternalGroup[] = []
  for (const [key, members] of byKey) {
    const store = members.find((row) => row.productId == null)
    const ratings = members.map((row) => row.rating)
    const primaryRating = store?.rating ?? Math.max(...ratings)
    const times = members.map((row) => row.createdAt.getTime())
    groups.push({
      key,
      stubs: members,
      isOrderGroup: members.some((row) => Boolean(row.orderId?.trim())),
      newestAt: Math.max(...times),
      oldestAt: Math.min(...times),
      primaryRating,
    })
  }
  return groups
}

function sortGroups(groups: InternalGroup[], sort: ReviewGroupSort): InternalGroup[] {
  const copy = [...groups]
  copy.sort((a, b) => {
    if (sort === 'oldest') {
      if (a.oldestAt !== b.oldestAt) return a.oldestAt - b.oldestAt
      return a.key.localeCompare(b.key)
    }
    if (sort === 'rating_desc') {
      if (a.primaryRating !== b.primaryRating) return b.primaryRating - a.primaryRating
      if (a.newestAt !== b.newestAt) return b.newestAt - a.newestAt
      return a.key.localeCompare(b.key)
    }
    if (sort === 'rating_asc') {
      if (a.primaryRating !== b.primaryRating) return a.primaryRating - b.primaryRating
      if (a.newestAt !== b.newestAt) return b.newestAt - a.newestAt
      return a.key.localeCompare(b.key)
    }
    // newest (default)
    if (a.newestAt !== b.newestAt) return b.newestAt - a.newestAt
    return a.key.localeCompare(b.key)
  })
  return copy
}

/**
 * Paginate distinct submission groups built from matching review stubs.
 * Callers that apply a rating filter should expand order siblings before this
 * so groups stay complete on the page.
 */
export function paginateSubmissionGroups(
  stubs: ReviewGroupStub[],
  options: { page: number; pageSize: number; sort?: ReviewGroupSort },
): SubmissionGroupPage {
  const page = Math.max(1, options.page)
  const pageSize = Math.min(Math.max(1, options.pageSize), 50)
  const sort = options.sort ?? 'newest'

  const sorted = sortGroups(buildGroups(stubs), sort)
  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1)
  const start = (page - 1) * pageSize
  const slice = sorted.slice(start, start + pageSize)

  const groupKeys = slice.map((g) => g.key)
  const orderIds: string[] = []
  const standaloneIds: string[] = []
  for (const group of slice) {
    if (group.isOrderGroup) orderIds.push(group.key)
    else standaloneIds.push(group.key)
  }

  return {
    groupKeys,
    total,
    page,
    pageSize,
    totalPages,
    orderIds,
    standaloneIds,
  }
}

/** Stable order: groups in `groupKeys` order; within group store first, then products by createdAt. */
export function orderReviewsByGroupKeys<T extends ReviewGroupStub>(
  reviews: T[],
  groupKeys: string[],
): T[] {
  const byKey = new Map<string, T[]>()
  for (const review of reviews) {
    const key = submissionGroupKey(review)
    const bucket = byKey.get(key)
    if (bucket) bucket.push(review)
    else byKey.set(key, [review])
  }

  const ordered: T[] = []
  for (const key of groupKeys) {
    const members = byKey.get(key) ?? []
    members.sort((a, b) => {
      const aStore = a.productId == null ? 0 : 1
      const bStore = b.productId == null ? 0 : 1
      if (aStore !== bStore) return aStore - bStore
      return a.createdAt.getTime() - b.createdAt.getTime()
    })
    ordered.push(...members)
  }
  return ordered
}

export function uniqueStubsById(stubs: ReviewGroupStub[]): ReviewGroupStub[] {
  const seen = new Set<string>()
  const out: ReviewGroupStub[] = []
  for (const stub of stubs) {
    if (seen.has(stub.id)) continue
    seen.add(stub.id)
    out.push(stub)
  }
  return out
}
