export type NavigationMenuItemLabels = {
  uk?: string
  en?: string
  sk?: string
}

export type NavigationMenuItem = {
  id: string
  /** Ключ i18n (nav.*) — якщо задано, label береться з перекладів */
  labelKey?: string
  /** Власні підписи (перекривають labelKey для відповідної локалі) */
  labels?: NavigationMenuItemLabels
  href: string
  icon?: string
  visible: boolean
  sortOrder: number
  openInNewTab?: boolean
  /** Для пункту каталогу — підставляти slug кореня каталогу замість href */
  useCatalogHref?: boolean
}

export type NavigationSettings = {
  items: NavigationMenuItem[]
}

export const DEFAULT_NAVIGATION_ITEMS: NavigationMenuItem[] = [
  {
    id: 'home',
    labelKey: 'home',
    href: '/',
    icon: 'Home',
    visible: true,
    sortOrder: 0,
  },
  {
    id: 'catalog',
    labelKey: 'catalog',
    href: '/catalog',
    icon: 'LayoutGrid',
    visible: true,
    sortOrder: 10,
    useCatalogHref: true,
  },
  {
    id: 'plants',
    labelKey: 'plantsList',
    href: '/plants',
    icon: 'List',
    visible: true,
    sortOrder: 15,
  },
  {
    id: 'promotions',
    labelKey: 'promotions',
    href: '/promotions',
    icon: 'Percent',
    visible: true,
    sortOrder: 20,
  },
  {
    id: 'fresh-photos',
    labelKey: 'freshPhotos',
    href: '/fresh-photos',
    icon: 'Camera',
    visible: true,
    sortOrder: 25,
  },
  {
    id: 'new-arrivals',
    labelKey: 'newArrivals',
    href: '/new-arrivals',
    icon: 'Sparkles',
    visible: true,
    sortOrder: 30,
  },
  {
    id: 'blog',
    labelKey: 'blog',
    href: '/blog',
    icon: 'BookOpen',
    visible: true,
    sortOrder: 40,
  },
  {
    id: 'reviews',
    labelKey: 'reviews',
    href: '/reviews',
    icon: 'Star',
    visible: true,
    sortOrder: 50,
  },
  {
    id: 'favorites',
    labelKey: 'favorites',
    href: '/favorites',
    icon: 'Heart',
    visible: true,
    sortOrder: 60,
  },
  {
    id: 'about',
    labelKey: 'about',
    href: '/about',
    icon: 'Info',
    visible: true,
    sortOrder: 70,
  },
]

export const DEFAULT_NAVIGATION_SETTINGS: NavigationSettings = {
  items: DEFAULT_NAVIGATION_ITEMS,
}
