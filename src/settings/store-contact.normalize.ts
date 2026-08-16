import {
  DEFAULT_CONTACT_BLOCKS,
  DEFAULT_FOOTER_VISIBILITY,
  DEFAULT_MAPS_URL,
  DEFAULT_SOCIAL_LINKS,
  DEFAULT_STORE_COMPANY_DETAILS,
  DEFAULT_STORE_SETTINGS,
  type StoreCompanyDetails,
  type StoreContactBlock,
  type StoreContactLine,
  type StoreContactLineType,
  type StoreContactSettings,
  type StoreEmailContact,
  type StoreFooterVisibility,
  type StoreHoursSchedule,
  type StorePhoneContact,
  type StoreSocialLink,
  type StoreSocialLinks,
} from './settings.constants'
import { normalizeCheckoutBankDetails } from './cart-checkout.normalize'

type LegacyFooter = Partial<StoreFooterVisibility> & {
  showPhones?: boolean
  showEmails?: boolean
}

type LegacyStoreContact = Partial<StoreContactSettings> & {
  phone?: string
  email?: string
  hoursWeekdays?: string
  hoursSaturday?: string
  footer?: LegacyFooter
}

const CONTACT_LINE_TYPES: StoreContactLineType[] = [
  'phone',
  'email',
  'viber',
  'telegram',
  'whatsapp',
  'link',
]

function normalizeContactLine(raw: Partial<StoreContactLine>): StoreContactLine | null {
  const type = CONTACT_LINE_TYPES.includes(raw.type as StoreContactLineType)
    ? (raw.type as StoreContactLineType)
    : 'link'
  const value = raw.value?.trim() ?? ''
  if (!value) return null
  const label = raw.label?.trim() || undefined
  return { type, value, ...(label ? { label } : {}) }
}

function normalizeContactBlocks(raw: LegacyStoreContact): StoreContactBlock[] {
  if (raw.contactBlocks?.length) {
    return raw.contactBlocks
      .map((block) => {
        const title = block.title?.trim() || 'Контакти'
        const lines = (block.lines ?? [])
          .map((line) => normalizeContactLine(line))
          .filter((line): line is StoreContactLine => line != null)
        return lines.length ? { title, lines } : null
      })
      .filter((block): block is StoreContactBlock => block != null)
  }

  const phones = raw.phones?.length
    ? raw.phones
    : raw.phone?.trim()
      ? [{ label: 'Підтримка', phone: raw.phone.trim() }]
      : []

  const emails = raw.emails?.length
    ? raw.emails
    : raw.email?.trim()
      ? [{ label: 'Підтримка', email: raw.email.trim() }]
      : []

  if (!phones.length && !emails.length) {
    return DEFAULT_CONTACT_BLOCKS
  }

  const order: string[] = []
  const blocks = new Map<string, StoreContactBlock>()

  const ensure = (label: string) => {
    const title = label.trim() || 'Контакти'
    const key = title.toLowerCase()
    if (!blocks.has(key)) {
      blocks.set(key, { title, lines: [] })
      order.push(key)
    }
    return blocks.get(key)!
  }

  for (const item of phones) {
    const value = item.phone?.trim()
    if (!value) continue
    ensure(item.label).lines.push({ type: 'phone', value })
  }
  for (const item of emails) {
    const value = item.email?.trim()
    if (!value) continue
    ensure(item.label).lines.push({ type: 'email', value })
  }

  return order
    .map((key) => blocks.get(key)!)
    .filter((block) => block.lines.length > 0)
}

export function derivePhonesFromContactBlocks(blocks: StoreContactBlock[]): StorePhoneContact[] {
  return blocks.flatMap((block) =>
    block.lines
      .filter((line) => line.type === 'phone' && line.value.trim())
      .map((line) => ({ label: block.title, phone: line.value.trim() })),
  )
}

export function deriveEmailsFromContactBlocks(blocks: StoreContactBlock[]): StoreEmailContact[] {
  return blocks.flatMap((block) =>
    block.lines
      .filter((line) => line.type === 'email' && line.value.trim())
      .map((line) => ({ label: block.title, email: line.value.trim() })),
  )
}

function normalizeSchedules(raw: LegacyStoreContact): StoreHoursSchedule[] {
  if (raw.schedules?.length) return raw.schedules

  const entries = []
  if (raw.hoursWeekdays?.trim()) {
    entries.push({ label: 'Пн-Пт', value: raw.hoursWeekdays.trim() })
  }
  if (raw.hoursSaturday?.trim()) {
    entries.push({ label: 'Субота', value: raw.hoursSaturday.trim() })
  }
  if (entries.length > 0) {
    return [{ title: 'Графік роботи', entries }]
  }

  return DEFAULT_STORE_SETTINGS.schedules
}

function normalizeFooter(raw: LegacyStoreContact): StoreFooterVisibility {
  const footer = raw.footer

  if (!footer) {
    return {
      showAddress: true,
      showPhone: true,
      showEmail: true,
      showViber: true,
      showTelegram: true,
      showWhatsApp: true,
      showLink: true,
      showSchedules: true,
      showCompanyDetails: false,
    }
  }

  return normalizeFooterVisibility(footer, DEFAULT_FOOTER_VISIBILITY)
}

function normalizeFooterVisibility(
  footer: LegacyFooter,
  defaults: StoreFooterVisibility,
): StoreFooterVisibility {
  const hasLegacyPhones = footer.showPhones !== undefined
  const hasLegacyEmails = footer.showEmails !== undefined
  const legacyPhones = footer.showPhones
  const legacyEmails = footer.showEmails

  return {
    showAddress: footer.showAddress ?? defaults.showAddress,
    showPhone: footer.showPhone ?? (hasLegacyPhones ? legacyPhones! : defaults.showPhone),
    showEmail: footer.showEmail ?? (hasLegacyEmails ? legacyEmails! : defaults.showEmail),
    showViber: footer.showViber ?? (hasLegacyPhones ? legacyPhones! : defaults.showViber),
    showTelegram: footer.showTelegram ?? (hasLegacyPhones ? legacyPhones! : defaults.showTelegram),
    showWhatsApp: footer.showWhatsApp ?? (hasLegacyPhones ? legacyPhones! : defaults.showWhatsApp),
    showLink:
      footer.showLink ??
      (hasLegacyPhones || hasLegacyEmails
        ? Boolean(legacyPhones) || Boolean(legacyEmails)
        : defaults.showLink),
    showSchedules: footer.showSchedules ?? defaults.showSchedules,
    showCompanyDetails: footer.showCompanyDetails ?? defaults.showCompanyDetails,
  }
}

function normalizeSocialLink(
  raw: Partial<StoreSocialLink> | undefined,
  fallback: StoreSocialLink,
): StoreSocialLink {
  return {
    show: raw?.show ?? fallback.show,
    url: raw?.url?.trim() ?? fallback.url,
  }
}

function normalizeSocial(raw: LegacyStoreContact): StoreSocialLinks {
  const base = DEFAULT_SOCIAL_LINKS
  if (!raw.social) return { ...base }

  return {
    instagram: normalizeSocialLink(raw.social.instagram, base.instagram),
    facebook: normalizeSocialLink(raw.social.facebook, base.facebook),
    youtube: normalizeSocialLink(raw.social.youtube, base.youtube),
    viberCommunity: normalizeSocialLink(raw.social.viberCommunity, base.viberCommunity),
    telegramCommunity: normalizeSocialLink(raw.social.telegramCommunity, base.telegramCommunity),
  }
}

export function normalizeStoreContactSettings(raw: LegacyStoreContact): StoreContactSettings {
  let contactBlocks = normalizeContactBlocks(raw)
  if (!contactBlocks.length) {
    contactBlocks = DEFAULT_CONTACT_BLOCKS
  }

  return {
    addressLine1: raw.addressLine1?.trim() || DEFAULT_STORE_SETTINGS.addressLine1,
    addressLine2: raw.addressLine2?.trim() || DEFAULT_STORE_SETTINGS.addressLine2,
    mapsUrl: raw.mapsUrl?.trim() || DEFAULT_MAPS_URL,
    mapsEmbedUrl: raw.mapsEmbedUrl?.trim() || undefined,
    contactBlocks,
    phones: derivePhonesFromContactBlocks(contactBlocks),
    emails: deriveEmailsFromContactBlocks(contactBlocks),
    schedules: normalizeSchedules(raw),
    footer: normalizeFooter(raw),
    social: normalizeSocial(raw),
    companyDetails: normalizeCheckoutBankDetails(
      raw.companyDetails ?? DEFAULT_STORE_COMPANY_DETAILS,
    ) as StoreCompanyDetails,
    showCompanyOnContacts: raw.showCompanyOnContacts === true,
  }
}
