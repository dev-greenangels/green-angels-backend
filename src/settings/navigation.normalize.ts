import {
  DEFAULT_NAVIGATION_ITEMS,
  DEFAULT_NAVIGATION_SETTINGS,
  type NavigationMenuItem,
  type NavigationSettings,
} from './navigation.types'

function normalizeMenuItem(raw: unknown, index: number): NavigationMenuItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Partial<NavigationMenuItem>
  const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `item-${index}`
  const href = typeof item.href === 'string' ? item.href.trim() : ''
  if (!href) return null

  return {
    id,
    labelKey: typeof item.labelKey === 'string' && item.labelKey.trim() ? item.labelKey.trim() : undefined,
    labels:
      item.labels && typeof item.labels === 'object'
        ? {
            uk: typeof item.labels.uk === 'string' ? item.labels.uk : undefined,
            en: typeof item.labels.en === 'string' ? item.labels.en : undefined,
            sk: typeof item.labels.sk === 'string' ? item.labels.sk : undefined,
          }
        : undefined,
    href,
    icon: typeof item.icon === 'string' && item.icon.trim() ? item.icon.trim() : undefined,
    visible: item.visible !== false,
    sortOrder: Number.isFinite(item.sortOrder) ? Math.floor(item.sortOrder as number) : index * 10,
    openInNewTab: item.openInNewTab === true,
    useCatalogHref: item.useCatalogHref === true,
  }
}

/** Додає відсутні дефолтні пункти (напр. нові сторінки) до збереженого меню. */
function mergeMissingDefaultItems(items: NavigationMenuItem[]): NavigationMenuItem[] {
  const existingIds = new Set(items.map((item) => item.id))
  const missing = DEFAULT_NAVIGATION_ITEMS.filter((item) => !existingIds.has(item.id))
  if (!missing.length) return items
  return [...items, ...missing].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function normalizeNavigationSettings(raw: unknown): NavigationSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NAVIGATION_SETTINGS }

  const source = raw as Partial<NavigationSettings>
  const items = Array.isArray(source.items)
    ? source.items
        .map((item, index) => normalizeMenuItem(item, index))
        .filter((item): item is NavigationMenuItem => item != null)
        .sort((a, b) => a.sortOrder - b.sortOrder)
    : []

  return {
    items: mergeMissingDefaultItems(items.length ? items : [...DEFAULT_NAVIGATION_ITEMS]),
  }
}
