export type {
  LegalSeedDocumentType,
  LegalSeedEntry,
  LegalSeedSection,
  LegalStorefrontLocale,
} from './legal-seed.types'
export { LEGAL_STOREFRONT_LOCALES } from './legal-seed.types'
export { getLegalSeedForMarket, LEGAL_SEED_SK_DEFAULT } from './legal-seed-registry'

/** @deprecated Use getLegalSeedForMarket() per deploy market. */
export { LEGAL_SEED_SK_DEFAULT as LEGAL_SEED } from './legal-seed-registry'

export { RETURNS_WITHDRAWAL_FORMS_MARKER } from './returns-page-seed-common'
export { SK_RETURNS_PAGE_SEED } from './returns-page-seed-sk'
export { UA_RETURNS_PAGE_SEED } from './returns-page-seed-ua'
