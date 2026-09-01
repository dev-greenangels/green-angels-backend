export type MarketingSubscriberStatus = 'active' | 'withdrawn'

export type MarketingSubscriberListItem = {
  subscriberKey: string
  userId: string | null
  email: string | null
  firstName: string | null
  lastName: string | null
  source: string | null
  status: MarketingSubscriberStatus
  subscribedAt: string | null
  unsubscribedAt: string | null
  isRegistered: boolean
}

export type MarketingSubscriberPage = {
  items: MarketingSubscriberListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type MarketingConsentSummary = {
  subscribed: boolean
  source: string | null
  subscribedAt: string | null
  unsubscribedAt: string | null
}

export type MarketingSubscribersListQuery = {
  q?: string
  status?: 'active' | 'withdrawn' | 'all'
  sortBy?: 'subscribedAt' | 'email' | 'lastName' | 'status' | 'source'
  sortDir?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}

type MarketingSubscriberRow = {
  subscriber_key: string
  userId: string | null
  email: string | null
  firstName: string | null
  lastName: string | null
  source: string | null
  status: string
  subscribedAt: Date | null
  unsubscribedAt: Date | null
  isRegistered: boolean
}

export function mapMarketingSubscriberRow(row: MarketingSubscriberRow): MarketingSubscriberListItem {
  return {
    subscriberKey: row.subscriber_key,
    userId: row.userId,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    source: row.source,
    status: row.status === 'active' ? 'active' : 'withdrawn',
    subscribedAt: row.subscribedAt ? row.subscribedAt.toISOString() : null,
    unsubscribedAt: row.unsubscribedAt ? row.unsubscribedAt.toISOString() : null,
    isRegistered: Boolean(row.isRegistered),
  }
}

export const MARKETING_SUBSCRIBERS_BASE_SQL = `
WITH events AS (
  SELECT
    e.id,
    e."userId",
    LOWER(TRIM(e.metadata->>'email')) AS meta_email,
    e.action,
    e.source,
    e."occurredAt"
  FROM "LegalConsentEvent" e
  WHERE e.purpose = 'MARKETING'
),
normalized AS (
  SELECT
    e.*,
    COALESCE(
      NULLIF(LOWER(TRIM(u.email)), ''),
      NULLIF(e.meta_email, ''),
      e."userId"::text
    ) AS subscriber_key,
    u.email AS user_email,
    u."firstName",
    u."lastName",
    u.id AS resolved_user_id
  FROM events e
  LEFT JOIN "User" u ON u.id = e."userId"
),
latest AS (
  SELECT DISTINCT ON (subscriber_key)
    subscriber_key,
    "userId",
    meta_email,
    user_email,
    "firstName",
    "lastName",
    resolved_user_id,
    action,
    source,
    "occurredAt"
  FROM normalized
  WHERE subscriber_key IS NOT NULL
  ORDER BY subscriber_key, "occurredAt" DESC
),
latest_granted AS (
  SELECT DISTINCT ON (subscriber_key)
    subscriber_key,
    source AS grant_source,
    "occurredAt" AS subscribed_at
  FROM normalized
  WHERE action = 'GRANTED' AND subscriber_key IS NOT NULL
  ORDER BY subscriber_key, "occurredAt" DESC
),
latest_withdrawn AS (
  SELECT DISTINCT ON (subscriber_key)
    subscriber_key,
    "occurredAt" AS unsubscribed_at
  FROM normalized
  WHERE action = 'WITHDRAWN' AND subscriber_key IS NOT NULL
  ORDER BY subscriber_key, "occurredAt" DESC
),
subscribers AS (
  SELECT
    l.subscriber_key,
    l.resolved_user_id AS "userId",
    COALESCE(l.user_email, l.meta_email) AS email,
    l."firstName",
    l."lastName",
    lg.grant_source AS source,
    CASE WHEN l.action = 'GRANTED' THEN 'active' ELSE 'withdrawn' END AS status,
    lg.subscribed_at AS "subscribedAt",
    CASE WHEN l.action = 'WITHDRAWN' THEN lw.unsubscribed_at ELSE NULL END AS "unsubscribedAt",
    (l.resolved_user_id IS NOT NULL) AS "isRegistered"
  FROM latest l
  LEFT JOIN latest_granted lg ON lg.subscriber_key = l.subscriber_key
  LEFT JOIN latest_withdrawn lw ON lw.subscriber_key = l.subscriber_key
)
`

export function resolveMarketingSubscribersSort(
  sortBy: MarketingSubscribersListQuery['sortBy'],
  sortDir: MarketingSubscribersListQuery['sortDir'],
): string {
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC'
  switch (sortBy) {
    case 'email':
      return `email ${dir} NULLS LAST, "lastName" ASC NULLS LAST`
    case 'lastName':
      return `"lastName" ${dir} NULLS LAST, "firstName" ${dir} NULLS LAST`
    case 'status':
      return `status ${dir}, "subscribedAt" DESC NULLS LAST`
    case 'source':
      return `source ${dir} NULLS LAST, "subscribedAt" DESC NULLS LAST`
    case 'subscribedAt':
    default:
      return `"subscribedAt" ${dir} NULLS LAST, email ASC NULLS LAST`
  }
}
