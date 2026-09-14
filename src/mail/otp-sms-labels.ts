/** OTP SMS copy — keyed by request locale (same allowlist as OTP email). */

export type OtpSmsLocale = 'uk' | 'en' | 'sk' | 'hu' | 'de' | 'cs'

const LABELS: Record<OtpSmsLocale, string> = {
  uk: 'Код для Зелені Янголи: {{code}}. Дійсний 5 хв. Нікому не повідомляйте.',
  en: 'Green Angels code: {{code}}. Valid 5 min. Do not share.',
  sk: 'Kód Green Angels: {{code}}. Platí 5 min. Nikomu neposielajte.',
  cs: 'Kód Green Angels: {{code}}. Platí 5 min. Nesdílejte s nikým.',
  hu: 'Green Angels kód: {{code}}. 5 percig érvényes. Ne ossza meg.',
  de: 'Green-Angels-Code: {{code}}. 5 Min. gültig. Nicht weitergeben.',
}

export function resolveOtpSmsLocale(raw?: string | null): OtpSmsLocale {
  const code = (raw ?? '').trim().toLowerCase().slice(0, 2)
  if (code === 'uk' || code === 'en' || code === 'sk' || code === 'hu' || code === 'de' || code === 'cs') {
    return code
  }
  return 'en'
}

export function getOtpSmsText(locale: OtpSmsLocale, code: string): string {
  return LABELS[locale].replace(/\{\{code\}\}/g, code)
}
