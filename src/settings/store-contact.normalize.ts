import {
  DEFAULT_FOOTER_VISIBILITY,
  DEFAULT_MAPS_URL,
  DEFAULT_SOCIAL_LINKS,
  DEFAULT_STORE_SETTINGS,
  type StoreContactSettings,
  type StoreEmailContact,
  type StoreFooterVisibility,
  type StoreHoursSchedule,
  type StorePhoneContact,
  type StoreSocialLink,
  type StoreSocialLinks,
} from './settings.constants'

type LegacyStoreContact = Partial<StoreContactSettings> & {
  phone?: string
  email?: string
  hoursWeekdays?: string
  hoursSaturday?: string
}

function normalizePhones(raw: LegacyStoreContact): StorePhoneContact[] {
  if (raw.phones?.length) return raw.phones
  if (raw.phone?.trim()) return [{ label: 'Підтримка', phone: raw.phone.trim() }]
  return DEFAULT_STORE_SETTINGS.phones
}

function normalizeEmails(raw: LegacyStoreContact): StoreEmailContact[] {
  if (raw.emails?.length) return raw.emails
  if (raw.email?.trim()) return [{ label: 'Підтримка', email: raw.email.trim() }]
  return DEFAULT_STORE_SETTINGS.emails
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
  if (!raw.footer) {
    return {
      showAddress: true,
      showPhones: true,
      showEmails: true,
      showSchedules: true,
    }
  }

  return {
    showAddress: raw.footer.showAddress ?? DEFAULT_FOOTER_VISIBILITY.showAddress,
    showPhones: raw.footer.showPhones ?? DEFAULT_FOOTER_VISIBILITY.showPhones,
    showEmails: raw.footer.showEmails ?? DEFAULT_FOOTER_VISIBILITY.showEmails,
    showSchedules: raw.footer.showSchedules ?? DEFAULT_FOOTER_VISIBILITY.showSchedules,
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
  return {
    addressLine1: raw.addressLine1?.trim() || DEFAULT_STORE_SETTINGS.addressLine1,
    addressLine2: raw.addressLine2?.trim() || DEFAULT_STORE_SETTINGS.addressLine2,
    mapsUrl: raw.mapsUrl?.trim() || DEFAULT_MAPS_URL,
    mapsEmbedUrl: raw.mapsEmbedUrl?.trim() || undefined,
    phones: normalizePhones(raw),
    emails: normalizeEmails(raw),
    schedules: normalizeSchedules(raw),
    footer: normalizeFooter(raw),
    social: normalizeSocial(raw),
  }
}
