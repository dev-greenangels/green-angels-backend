export type LegalSeedSection = {
  heading: string
  body: string[]
}

export type LegalSeedDocumentType =
  | 'TERMS'
  | 'PRIVACY'
  | 'COOKIES'
  | 'RETURNS'
  | 'MARKETING_CONSENT'

export type LegalSeedEntry = {
  type: LegalSeedDocumentType
  locale: string
  title: string
  intro: string
  sections: LegalSeedSection[]
}

export const LEGAL_STOREFRONT_LOCALES = ['uk', 'sk', 'en', 'de', 'hu', 'cs'] as const

export type LegalStorefrontLocale = (typeof LEGAL_STOREFRONT_LOCALES)[number]
