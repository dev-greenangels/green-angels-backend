/** OTP email copy — keyed by request locale (same allowlist as lifecycle emails). */

export type OtpEmailLocale = 'uk' | 'en' | 'sk' | 'hu' | 'de' | 'cs'

type OtpEmailCopy = {
  subject: string
  text: string
  html: string
}

const LABELS: Record<OtpEmailLocale, OtpEmailCopy> = {
  uk: {
    subject: 'Код для входу — Зелені Янголи',
    text: 'Код для входу в Зелені Янголи: {{code}}\n\nДійсний 5 хвилин. Нікому не повідомляйте цей код.',
    html: `
      <p>Код для входу в <strong>Зелені Янголи</strong>:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{code}}</p>
      <p>Дійсний 5 хвилин. Нікому не повідомляйте цей код.</p>
    `.trim(),
  },
  en: {
    subject: 'Sign-in code — Green Angels',
    text: 'Your Green Angels sign-in code: {{code}}\n\nValid for 5 minutes. Do not share this code.',
    html: `
      <p>Your <strong>Green Angels</strong> sign-in code:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{code}}</p>
      <p>Valid for 5 minutes. Do not share this code.</p>
    `.trim(),
  },
  sk: {
    subject: 'Prihlasovací kód — Green Angels',
    text: 'Váš prihlasovací kód Green Angels: {{code}}\n\nPlatí 5 minút. Nikomu tento kód neposielajte.',
    html: `
      <p>Váš prihlasovací kód <strong>Green Angels</strong>:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{code}}</p>
      <p>Platí 5 minút. Nikomu tento kód neposielajte.</p>
    `.trim(),
  },
  cs: {
    subject: 'Přihlašovací kód — Green Angels',
    text: 'Váš přihlašovací kód Green Angels: {{code}}\n\nPlatí 5 minut. Tento kód s nikým nesdílejte.',
    html: `
      <p>Váš přihlašovací kód <strong>Green Angels</strong>:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{code}}</p>
      <p>Platí 5 minut. Tento kód s nikým nesdílejte.</p>
    `.trim(),
  },
  hu: {
    subject: 'Bejelentkezési kód — Green Angels',
    text: 'Green Angels bejelentkezési kódja: {{code}}\n\n5 percig érvényes. Ne ossza meg senkivel.',
    html: `
      <p><strong>Green Angels</strong> bejelentkezési kódja:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{code}}</p>
      <p>5 percig érvényes. Ne ossza meg senkivel.</p>
    `.trim(),
  },
  de: {
    subject: 'Anmeldecode — Green Angels',
    text: 'Ihr Green-Angels-Anmeldecode: {{code}}\n\nGültig für 5 Minuten. Teilen Sie diesen Code mit niemandem.',
    html: `
      <p>Ihr <strong>Green Angels</strong>-Anmeldecode:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px">{{code}}</p>
      <p>Gültig für 5 Minuten. Teilen Sie diesen Code mit niemandem.</p>
    `.trim(),
  },
}

export function resolveOtpEmailLocale(raw?: string | null): OtpEmailLocale {
  const code = (raw ?? '').trim().toLowerCase().slice(0, 2)
  if (code === 'uk' || code === 'en' || code === 'sk' || code === 'hu' || code === 'de' || code === 'cs') {
    return code
  }
  return 'en'
}

export function getOtpEmailCopy(locale: OtpEmailLocale): OtpEmailCopy {
  return LABELS[locale]
}

export function fillOtpEmailTemplate(template: string, code: string): string {
  return template.replaceAll('{{code}}', code)
}
