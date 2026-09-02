import type { MarketRegion } from '../settings/market.types'
import type { StockNotificationLocale } from '../stock-notifications/stock-notification-locale'
import { resolveMailSenderDisplayName } from './mail-identity.rules'

export type StockAvailableEmailCopy = {
  subject: string
  greetingPersonal: string
  greetingGeneric: string
  bodyLead: string
  bodyAvailable: string
  ctaLabel: string
  signoff: string
  footerReason: string
}

const LABELS: Record<StockNotificationLocale, StockAvailableEmailCopy> = {
  uk: {
    subject: 'Знову в наявності: {{productName}}',
    greetingPersonal: 'Доброго дня, {{name}}!',
    greetingGeneric: 'Доброго дня!',
    bodyLead: 'Гарна новина — {{productName}} знову в наявності!',
    bodyAvailable: 'Рослина вже доступна для замовлення в нашому інтернет-магазині.',
    ctaLabel: 'Переглянути рослину на сайті →',
    signoff: 'З найкращими побажаннями,\nкоманда {{companyName}}',
    footerReason:
      'Ви отримали цей лист, оскільки залишали заявку на сповіщення про появу цієї рослини {{subscriptionDate}}.',
  },
  sk: {
    subject: 'Opäť na sklade: {{productName}}',
    greetingPersonal: 'Dobrý deň, {{name}}!',
    greetingGeneric: 'Dobrý deň!',
    bodyLead: 'Máme dobrú správu — {{productName}} je opäť na sklade!',
    bodyAvailable: 'Rastlina je už dostupná na objednanie v našom internetovom obchode.',
    ctaLabel: 'Zobraziť rastlinu na webe →',
    signoff: 'S priateľským pozdravom,\ntím {{companyName}}',
    footerReason:
      'Tento e-mail ste dostali, pretože ste {{subscriptionDate}} požiadali o upozornenie na dostupnosť tejto rastliny.',
  },
  cs: {
    subject: 'Opět skladem: {{productName}}',
    greetingPersonal: 'Dobrý den, {{name}}!',
    greetingGeneric: 'Dobrý den!',
    bodyLead: 'Máme dobrou zprávu — {{productName}} je opět skladem!',
    bodyAvailable: 'Rostlina je již k dispozici k objednání v našem internetovém obchodě.',
    ctaLabel: 'Zobrazit rostlinu na webu →',
    signoff: 'S přátelským pozdravem,\ntým {{companyName}}',
    footerReason:
      'Tento e-mail jste obdrželi, protože jste {{subscriptionDate}} požádali o upozornění na dostupnost této rostliny.',
  },
  hu: {
    subject: 'Újra készleten: {{productName}}',
    greetingPersonal: 'Jó napot, {{name}}!',
    greetingGeneric: 'Jó napot!',
    bodyLead: 'Jó hírünk van — {{productName}} újra készleten van!',
    bodyAvailable: 'A növény már rendelhető webáruházunkban.',
    ctaLabel: 'Növény megtekintése a weboldalon →',
    signoff: 'Üdvözlettel,\na {{companyName}} csapata',
    footerReason:
      'Azért kapta ezt az e-mailt, mert {{subscriptionDate}} értesítést kért erről a növény elérhetőségéről.',
  },
  de: {
    subject: 'Wieder verfügbar: {{productName}}',
    greetingPersonal: 'Guten Tag, {{name}}!',
    greetingGeneric: 'Guten Tag!',
    bodyLead: 'Gute Nachrichten — {{productName}} ist wieder verfügbar!',
    bodyAvailable: 'Die Pflanze kann jetzt in unserem Online-Shop bestellt werden.',
    ctaLabel: 'Pflanze im Shop ansehen →',
    signoff: 'Mit freundlichen Grüßen,\nIhr Team von {{companyName}}',
    footerReason:
      'Sie erhalten diese E-Mail, weil Sie am {{subscriptionDate}} eine Verfügbarkeitsbenachrichtigung für diese Pflanze angefordert haben.',
  },
  en: {
    subject: 'Back in stock: {{productName}}',
    greetingPersonal: 'Hello, {{name}}!',
    greetingGeneric: 'Hello!',
    bodyLead: 'Good news — {{productName}} is back in stock!',
    bodyAvailable: 'The plant is now available to order in our online shop.',
    ctaLabel: 'View the plant on our website →',
    signoff: 'Best regards,\nthe {{companyName}} team',
    footerReason:
      'You received this email because you requested a back-in-stock alert for this plant on {{subscriptionDate}}.',
  },
}

export function getStockAvailableEmailLabels(locale: StockNotificationLocale): StockAvailableEmailCopy {
  return LABELS[locale]
}

export function formatStockNotificationDate(date: Date, locale: StockNotificationLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date)
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '')
}

export function buildStockAvailableEmailContent(input: {
  locale: StockNotificationLocale
  name: string
  productName: string
  productUrl: string
  companyName: string
  subscriptionDate: Date
}): { subject: string; text: string; html: string } {
  const labels = getStockAvailableEmailLabels(input.locale)
  const subscriptionDate = formatStockNotificationDate(input.subscriptionDate, input.locale)
  const trimmedName = input.name.trim()
  const greeting = fillTemplate(
    trimmedName ? labels.greetingPersonal : labels.greetingGeneric,
    { name: trimmedName, productName: input.productName, companyName: input.companyName, subscriptionDate },
  )
  const vars = {
    name: trimmedName,
    productName: input.productName,
    companyName: input.companyName,
    subscriptionDate,
  }

  const text = [
    greeting,
    '',
    fillTemplate(labels.bodyLead, vars),
    '',
    labels.bodyAvailable,
    '',
    `${fillTemplate(labels.ctaLabel, vars)}`,
    input.productUrl,
    '',
    fillTemplate(labels.signoff, vars),
    '',
    fillTemplate(labels.footerReason, vars),
  ].join('\n')

  const html = `
    <p>${greeting.replace(/\n/g, '<br>')}</p>
    <p>${fillTemplate(labels.bodyLead, vars)}</p>
    <p>${labels.bodyAvailable}</p>
    <p><a href="${input.productUrl}">${fillTemplate(labels.ctaLabel, vars)}</a></p>
    <p>${fillTemplate(labels.signoff, vars).replace(/\n/g, '<br>')}</p>
    <p style="color:#666;font-size:12px;">${fillTemplate(labels.footerReason, vars)}</p>
  `.trim()

  return {
    subject: fillTemplate(labels.subject, vars),
    text,
    html,
  }
}

export function resolveStockEmailCompanyName(region: MarketRegion): string {
  return resolveMailSenderDisplayName(region)
}
