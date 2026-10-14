/**
 * Single source of truth for staff permission keys.
 * Strings in DB — adding a key does not require a Prisma enum migration.
 */

export type PermissionStatus = 'EXISTING' | 'PLANNED'

export type PermissionGroupId =
  | 'applications'
  | 'catalog'
  | 'orders'
  | 'customers'
  | 'marketing'
  | 'content'
  | 'operations'
  | 'administration'
  | 'plantstock'
  | 'planned'

export type StaffPermission =
  | 'backoffice.access'
  | 'plantstock.access'
  | 'catalog.view'
  | 'catalog.edit'
  | 'catalog.import'
  | 'photos.view'
  | 'photos.manage'
  | 'orders.view'
  | 'orders.manage'
  | 'orders.dictionaries'
  | 'dispatch.calendar'
  | 'contract.withdrawals'
  | 'customers.view'
  | 'customers.edit'
  | 'carts.view'
  | 'wholesale.inquiries'
  | 'stock.notifications'
  | 'promotions.manage'
  | 'referrals.manage'
  | 'marketing.subscribers'
  | 'reviews.manage'
  | 'google.merchant'
  | 'content.blog'
  | 'content.pages'
  | 'legal.manage'
  | 'site.localization'
  | 'site.navigation'
  | 'site.redirects'
  | 'site.reference'
  | 'supplier.invoices'
  | 'tedb.manage'
  | 'jobs.view'
  | 'settings.view'
  | 'settings.manage'
  | 'flexi.view'
  | 'flexi.manage'
  | 'flexi.admin'
  | 'staff.manage'
  | 'plantstock.settings'
  | 'plantstock.catalog.sync'
  | 'reservations.view'
  | 'inventory.view'
  | 'inventory.create'
  | 'inventory.post'
  | 'reservations.sync'

export type PermissionDefinition = {
  key: StaffPermission
  group: PermissionGroupId
  /** i18n key under backstage.permissions.* */
  labelKey: string
  descriptionKey: string
  status: PermissionStatus
}

export const PERMISSION_REGISTRY: readonly PermissionDefinition[] = [
  // Applications
  {
    key: 'backoffice.access',
    group: 'applications',
    labelKey: 'backofficeAccess',
    descriptionKey: 'backofficeAccessDesc',
    status: 'EXISTING',
  },
  {
    key: 'plantstock.access',
    group: 'applications',
    labelKey: 'plantstockAccess',
    descriptionKey: 'plantstockAccessDesc',
    status: 'EXISTING',
  },
  // Catalog
  {
    key: 'catalog.view',
    group: 'catalog',
    labelKey: 'catalogView',
    descriptionKey: 'catalogViewDesc',
    status: 'EXISTING',
  },
  {
    key: 'catalog.edit',
    group: 'catalog',
    labelKey: 'catalogEdit',
    descriptionKey: 'catalogEditDesc',
    status: 'EXISTING',
  },
  {
    key: 'catalog.import',
    group: 'catalog',
    labelKey: 'catalogImport',
    descriptionKey: 'catalogImportDesc',
    status: 'EXISTING',
  },
  {
    key: 'photos.view',
    group: 'catalog',
    labelKey: 'photosView',
    descriptionKey: 'photosViewDesc',
    status: 'EXISTING',
  },
  {
    key: 'photos.manage',
    group: 'catalog',
    labelKey: 'photosManage',
    descriptionKey: 'photosManageDesc',
    status: 'EXISTING',
  },
  // Orders
  {
    key: 'orders.view',
    group: 'orders',
    labelKey: 'ordersView',
    descriptionKey: 'ordersViewDesc',
    status: 'EXISTING',
  },
  {
    key: 'orders.manage',
    group: 'orders',
    labelKey: 'ordersManage',
    descriptionKey: 'ordersManageDesc',
    status: 'EXISTING',
  },
  {
    key: 'orders.dictionaries',
    group: 'orders',
    labelKey: 'ordersDictionaries',
    descriptionKey: 'ordersDictionariesDesc',
    status: 'EXISTING',
  },
  {
    key: 'dispatch.calendar',
    group: 'orders',
    labelKey: 'dispatchCalendar',
    descriptionKey: 'dispatchCalendarDesc',
    status: 'EXISTING',
  },
  {
    key: 'contract.withdrawals',
    group: 'orders',
    labelKey: 'contractWithdrawals',
    descriptionKey: 'contractWithdrawalsDesc',
    status: 'EXISTING',
  },
  // Customers
  {
    key: 'customers.view',
    group: 'customers',
    labelKey: 'customersView',
    descriptionKey: 'customersViewDesc',
    status: 'EXISTING',
  },
  {
    key: 'customers.edit',
    group: 'customers',
    labelKey: 'customersEdit',
    descriptionKey: 'customersEditDesc',
    status: 'EXISTING',
  },
  {
    key: 'carts.view',
    group: 'customers',
    labelKey: 'cartsView',
    descriptionKey: 'cartsViewDesc',
    status: 'EXISTING',
  },
  {
    key: 'wholesale.inquiries',
    group: 'customers',
    labelKey: 'wholesaleInquiries',
    descriptionKey: 'wholesaleInquiriesDesc',
    status: 'EXISTING',
  },
  {
    key: 'stock.notifications',
    group: 'customers',
    labelKey: 'stockNotifications',
    descriptionKey: 'stockNotificationsDesc',
    status: 'EXISTING',
  },
  // Marketing
  {
    key: 'promotions.manage',
    group: 'marketing',
    labelKey: 'promotionsManage',
    descriptionKey: 'promotionsManageDesc',
    status: 'EXISTING',
  },
  {
    key: 'referrals.manage',
    group: 'marketing',
    labelKey: 'referralsManage',
    descriptionKey: 'referralsManageDesc',
    status: 'EXISTING',
  },
  {
    key: 'marketing.subscribers',
    group: 'marketing',
    labelKey: 'marketingSubscribers',
    descriptionKey: 'marketingSubscribersDesc',
    status: 'EXISTING',
  },
  {
    key: 'reviews.manage',
    group: 'marketing',
    labelKey: 'reviewsManage',
    descriptionKey: 'reviewsManageDesc',
    status: 'EXISTING',
  },
  {
    key: 'google.merchant',
    group: 'marketing',
    labelKey: 'googleMerchant',
    descriptionKey: 'googleMerchantDesc',
    status: 'EXISTING',
  },
  // Content / site
  {
    key: 'content.blog',
    group: 'content',
    labelKey: 'contentBlog',
    descriptionKey: 'contentBlogDesc',
    status: 'EXISTING',
  },
  {
    key: 'content.pages',
    group: 'content',
    labelKey: 'contentPages',
    descriptionKey: 'contentPagesDesc',
    status: 'EXISTING',
  },
  {
    key: 'legal.manage',
    group: 'content',
    labelKey: 'legalManage',
    descriptionKey: 'legalManageDesc',
    status: 'EXISTING',
  },
  {
    key: 'site.localization',
    group: 'content',
    labelKey: 'siteLocalization',
    descriptionKey: 'siteLocalizationDesc',
    status: 'EXISTING',
  },
  {
    key: 'site.navigation',
    group: 'content',
    labelKey: 'siteNavigation',
    descriptionKey: 'siteNavigationDesc',
    status: 'EXISTING',
  },
  {
    key: 'site.redirects',
    group: 'content',
    labelKey: 'siteRedirects',
    descriptionKey: 'siteRedirectsDesc',
    status: 'EXISTING',
  },
  {
    key: 'site.reference',
    group: 'content',
    labelKey: 'siteReference',
    descriptionKey: 'siteReferenceDesc',
    status: 'EXISTING',
  },
  // Operations
  {
    key: 'supplier.invoices',
    group: 'operations',
    labelKey: 'supplierInvoices',
    descriptionKey: 'supplierInvoicesDesc',
    status: 'EXISTING',
  },
  {
    key: 'tedb.manage',
    group: 'operations',
    labelKey: 'tedbManage',
    descriptionKey: 'tedbManageDesc',
    status: 'EXISTING',
  },
  {
    key: 'jobs.view',
    group: 'operations',
    labelKey: 'jobsView',
    descriptionKey: 'jobsViewDesc',
    status: 'EXISTING',
  },
  // Administration
  {
    key: 'settings.view',
    group: 'administration',
    labelKey: 'settingsView',
    descriptionKey: 'settingsViewDesc',
    status: 'EXISTING',
  },
  {
    key: 'settings.manage',
    group: 'administration',
    labelKey: 'settingsManage',
    descriptionKey: 'settingsManageDesc',
    status: 'EXISTING',
  },
  {
    key: 'flexi.view',
    group: 'administration',
    labelKey: 'flexiView',
    descriptionKey: 'flexiViewDesc',
    status: 'EXISTING',
  },
  {
    key: 'flexi.manage',
    group: 'administration',
    labelKey: 'flexiManage',
    descriptionKey: 'flexiManageDesc',
    status: 'EXISTING',
  },
  {
    key: 'flexi.admin',
    group: 'administration',
    labelKey: 'flexiAdmin',
    descriptionKey: 'flexiAdminDesc',
    status: 'EXISTING',
  },
  {
    key: 'staff.manage',
    group: 'administration',
    labelKey: 'staffManage',
    descriptionKey: 'staffManageDesc',
    status: 'EXISTING',
  },
  // PlantStock (Nest)
  {
    key: 'plantstock.settings',
    group: 'plantstock',
    labelKey: 'plantstockSettings',
    descriptionKey: 'plantstockSettingsDesc',
    status: 'EXISTING',
  },
  {
    key: 'plantstock.catalog.sync',
    group: 'plantstock',
    labelKey: 'plantstockCatalogSync',
    descriptionKey: 'plantstockCatalogSyncDesc',
    status: 'EXISTING',
  },
  {
    key: 'reservations.view',
    group: 'plantstock',
    labelKey: 'reservationsView',
    descriptionKey: 'reservationsViewDesc',
    status: 'EXISTING',
  },
  // PLANNED — registry only, no write endpoints
  {
    key: 'inventory.view',
    group: 'planned',
    labelKey: 'inventoryView',
    descriptionKey: 'inventoryViewDesc',
    status: 'PLANNED',
  },
  {
    key: 'inventory.create',
    group: 'planned',
    labelKey: 'inventoryCreate',
    descriptionKey: 'inventoryCreateDesc',
    status: 'PLANNED',
  },
  {
    key: 'inventory.post',
    group: 'planned',
    labelKey: 'inventoryPost',
    descriptionKey: 'inventoryPostDesc',
    status: 'PLANNED',
  },
  {
    key: 'reservations.sync',
    group: 'planned',
    labelKey: 'reservationsSync',
    descriptionKey: 'reservationsSyncDesc',
    status: 'PLANNED',
  },
] as const

const KEY_SET = new Set(PERMISSION_REGISTRY.map((p) => p.key))

export function isStaffPermission(value: string): value is StaffPermission {
  return KEY_SET.has(value as StaffPermission)
}

export function existingPermissionKeys(): StaffPermission[] {
  return PERMISSION_REGISTRY.filter((p) => p.status === 'EXISTING').map((p) => p.key)
}

export function permissionDefinitionsForUi(): PermissionDefinition[] {
  return PERMISSION_REGISTRY.filter((p) => p.status === 'EXISTING')
}
