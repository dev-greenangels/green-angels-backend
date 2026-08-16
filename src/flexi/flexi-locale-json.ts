import type { FlexiLocaleCode } from './flexi.types'

/** Shop locales accepted from Flexi JSON (cz mapped to cs). */
export const FLEXI_LOCALE_KEYS = new Set(['uk', 'en', 'sk', 'hu', 'de', 'cs', 'cz'])

export type FlexiLocaleTextMap = Partial<Record<FlexiLocaleCode, string>>

/**
 * Parse multilingual JSON `{"uk":"…","sk":"…"}` into shop locale → text.
 * Invalid JSON, plain text, empty values, and unknown keys are ignored.
 */
export function parseFlexiLocaleJson(value: unknown): FlexiLocaleTextMap | null {
  if (value == null || value === '') return null
  let obj: unknown = value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.startsWith('{')) return null
    try {
      obj = JSON.parse(trimmed)
    } catch {
      return null
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null
  const out: FlexiLocaleTextMap = {}
  let found = false
  for (const [rawKey, rawText] of Object.entries(obj as Record<string, unknown>)) {
    const key = rawKey.trim().toLowerCase()
    if (!FLEXI_LOCALE_KEYS.has(key)) continue
    const locale: FlexiLocaleCode = key === 'cz' ? 'cs' : (key as FlexiLocaleCode)
    const text = typeof rawText === 'string' ? rawText.trim() : String(rawText ?? '').trim()
    if (!text) continue
    out[locale] = text
    found = true
  }
  return found ? out : null
}

function firstLocaleJson(row: Record<string, unknown>, keys: string[]): FlexiLocaleTextMap | null {
  const byLower = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]))
  for (const key of keys) {
    const actual = byLower.get(key.toLowerCase())
    if (!actual) continue
    const parsed = parseFlexiLocaleJson(row[actual])
    if (parsed) return parsed
  }
  return null
}

/** ABRA TreeNode content fields on strom (detail=full). */
export type StromLocaleFields = {
  localeNames: FlexiLocaleTextMap | null
  localeDescriptions: FlexiLocaleTextMap | null
  localeTextAbove: FlexiLocaleTextMap | null
  localeTextBelow: FlexiLocaleTextMap | null
}

/**
 * Short description → names; Text above / Text below / Description stay separate.
 * Does not scan unrelated notes for JSON (txtPod is footer, not a name).
 */
export function parseStromLocaleFields(row: Record<string, unknown>): StromLocaleFields {
  return {
    localeNames: firstLocaleJson(row, ['kratkyPopis']),
    localeDescriptions: firstLocaleJson(row, ['popis']),
    localeTextAbove: firstLocaleJson(row, ['txtNad']),
    localeTextBelow: firstLocaleJson(row, ['txtPod']),
  }
}
