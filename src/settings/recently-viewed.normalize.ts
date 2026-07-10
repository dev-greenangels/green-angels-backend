import {
  DEFAULT_RECENTLY_VIEWED_PAGES,
  DEFAULT_RECENTLY_VIEWED_SETTINGS,
  RECENTLY_VIEWED_PAGE_KEYS,
  type RecentlyViewedPageVisibility,
  type RecentlyViewedSettings,
} from './recently-viewed.types'

const MIN_ITEMS = 4
const MAX_ITEMS = 50

function normalizePages(pages: Partial<RecentlyViewedPageVisibility> | undefined): RecentlyViewedPageVisibility {
  const result = { ...DEFAULT_RECENTLY_VIEWED_PAGES }
  if (!pages) return result
  for (const key of RECENTLY_VIEWED_PAGE_KEYS) {
    if (typeof pages[key] === 'boolean') {
      result[key] = pages[key]
    }
  }
  return result
}

export function normalizeRecentlyViewedSettings(
  raw: Partial<RecentlyViewedSettings> | null | undefined,
): RecentlyViewedSettings {
  const title = raw?.title?.trim() || DEFAULT_RECENTLY_VIEWED_SETTINGS.title
  const maxItems = Math.min(
    MAX_ITEMS,
    Math.max(MIN_ITEMS, Math.round(Number(raw?.maxItems) || DEFAULT_RECENTLY_VIEWED_SETTINGS.maxItems)),
  )

  return {
    enabled: raw?.enabled ?? DEFAULT_RECENTLY_VIEWED_SETTINGS.enabled,
    title,
    maxItems,
    pages: normalizePages(raw?.pages),
  }
}
