import { SUPPORTED_LOCALES, type AppLocale } from './localization.types'
import type { MarketRegion } from './market.types'
import type {
  StoreContactBlock,
  StoreContactSettings,
  StoreHoursSchedule,
} from './settings.constants'

export type StoreContactCmsCopy = {
  addressLine1: string
  addressLine2: string
  contactBlocks: StoreContactBlock[]
  schedules: StoreHoursSchedule[]
}

export const EMPTY_STORE_CONTACT_CMS: StoreContactCmsCopy = {
  addressLine1: '',
  addressLine2: '',
  contactBlocks: [],
  schedules: [],
}

export function primaryStoreCmsLocale(region: MarketRegion): AppLocale {
  return region === 'sk' ? 'sk' : 'uk'
}

export function extractStoreContactCmsCopy(
  store: Pick<
    StoreContactSettings,
    'addressLine1' | 'addressLine2' | 'contactBlocks' | 'schedules'
  >,
): StoreContactCmsCopy {
  return {
    addressLine1: store.addressLine1 ?? '',
    addressLine2: store.addressLine2 ?? '',
    contactBlocks: structuredClone(store.contactBlocks ?? []),
    schedules: structuredClone(store.schedules ?? []),
  }
}

export function cloneStoreContactCms(copy: StoreContactCmsCopy): StoreContactCmsCopy {
  return structuredClone(copy)
}

export function isBlankStoreContactCms(copy: StoreContactCmsCopy): boolean {
  return (
    !copy.addressLine1.trim() &&
    !copy.addressLine2.trim() &&
    copy.contactBlocks.length === 0 &&
    copy.schedules.length === 0
  )
}

function normalizeBlock(raw: unknown): StoreContactBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const block = raw as StoreContactBlock
  const lines = Array.isArray(block.lines)
    ? block.lines
        .map((line) => ({
          type: line.type,
          label: line.label,
          value: String(line.value ?? ''),
        }))
        .filter((line) => line.value.trim())
    : []
  if (!lines.length) return null
  return { title: String(block.title ?? '').trim(), lines }
}

function normalizeSchedule(raw: unknown): StoreHoursSchedule | null {
  if (!raw || typeof raw !== 'object') return null
  const schedule = raw as StoreHoursSchedule
  const entries = Array.isArray(schedule.entries)
    ? schedule.entries.map((e) => ({
        label: String(e?.label ?? ''),
        value: String(e?.value ?? ''),
      }))
    : []
  return {
    title: String(schedule.title ?? ''),
    entries,
    note: schedule.note ? String(schedule.note) : '',
  }
}

function normalizeCmsCopy(raw: unknown): StoreContactCmsCopy | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Partial<StoreContactCmsCopy>
  return {
    addressLine1: String(source.addressLine1 ?? ''),
    addressLine2: String(source.addressLine2 ?? ''),
    contactBlocks: Array.isArray(source.contactBlocks)
      ? source.contactBlocks
          .map(normalizeBlock)
          .filter((b): b is StoreContactBlock => b != null)
      : [],
    schedules: Array.isArray(source.schedules)
      ? source.schedules
          .map(normalizeSchedule)
          .filter((s): s is StoreHoursSchedule => s != null)
      : [],
  }
}

export function normalizeStoreContactByLocale(
  raw: unknown,
  legacyFlat: Pick<
    StoreContactSettings,
    'addressLine1' | 'addressLine2' | 'contactBlocks' | 'schedules'
  >,
  region: MarketRegion,
): Partial<Record<AppLocale, StoreContactCmsCopy>> {
  const byLocale: Partial<Record<AppLocale, StoreContactCmsCopy>> = {}
  if (raw && typeof raw === 'object') {
    for (const locale of SUPPORTED_LOCALES) {
      const copy = normalizeCmsCopy((raw as Record<string, unknown>)[locale])
      if (copy) byLocale[locale] = copy
    }
  }
  if (Object.keys(byLocale).length === 0) {
    const extracted = extractStoreContactCmsCopy(legacyFlat)
    if (!isBlankStoreContactCms(extracted)) {
      byLocale[primaryStoreCmsLocale(region)] = extracted
    }
  }
  return byLocale
}

export function applyStoreContactCmsCopy(
  store: StoreContactSettings,
  copy: StoreContactCmsCopy,
): StoreContactSettings {
  const contactBlocks = structuredClone(copy.contactBlocks)
  return {
    ...store,
    addressLine1: copy.addressLine1,
    addressLine2: copy.addressLine2,
    contactBlocks,
    schedules: structuredClone(copy.schedules),
    phones: contactBlocks.flatMap((block) =>
      block.lines
        .filter((line) => line.type === 'phone' && line.value.trim())
        .map((line) => ({ label: block.title, phone: line.value.trim() })),
    ),
    emails: contactBlocks.flatMap((block) =>
      block.lines
        .filter((line) => line.type === 'email' && line.value.trim())
        .map((line) => ({ label: block.title, email: line.value.trim() })),
    ),
  }
}
