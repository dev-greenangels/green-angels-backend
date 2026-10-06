import type { AppLocale } from './localization.types'

export type ReviewRequestEmailTemplate = {
  subject: string
  body: string
}

export type ReviewTrigger = 'SHIPPED_PLUS_DELAY'

export type ReviewsSettings = {
  postPurchaseRequestsEnabled: boolean
  /** Configuration only in Phase 3 — automatic jobs must not run. */
  automaticSendingEnabled: boolean
  trigger: ReviewTrigger
  delayDays: number
  tokenValidityDays: number
  requestEmailTemplates: Partial<Record<AppLocale, ReviewRequestEmailTemplate>>
}

export const REVIEW_REQUEST_TEMPLATE_VARS = [
  'customerName',
  'orderNumber',
  'reviewUrl',
] as const

export type ReviewRequestTemplateVar = (typeof REVIEW_REQUEST_TEMPLATE_VARS)[number]

const REQUEST_TEMPLATES: Record<AppLocale, ReviewRequestEmailTemplate> = {
  sk: {
    subject: 'Ohodnoťte svoju objednávku Green Angels {{orderNumber}}',
    body: `Dobrý deň, {{customerName}},

ďakujeme za nákup v Green Angels (objednávka {{orderNumber}}).

Budeme radi, ak nám napíšete, ako ste spokojní s nákupom. Môžete ohodnotiť celkový nákup aj zakúpené rastliny:

{{reviewUrl}}

Ďakujeme,
tím Green Angels`,
  },
  cs: {
    subject: 'Ohodnoťte svou objednávku Green Angels {{orderNumber}}',
    body: `Dobrý den, {{customerName}},

děkujeme za nákup v Green Angels (objednávka {{orderNumber}}).

Budeme rádi, když nám napíšete, jak jste s nákupem spokojeni. Můžete ohodnotit celkový nákup i zakoupené rostliny:

{{reviewUrl}}

Děkujeme,
tým Green Angels`,
  },
  de: {
    subject: 'Bewerten Sie Ihre Green-Angels-Bestellung {{orderNumber}}',
    body: `Guten Tag, {{customerName}},

vielen Dank für Ihren Einkauf bei Green Angels (Bestellung {{orderNumber}}).

Wir freuen uns über Ihr Feedback. Sie können den Gesamteinkauf und die gekauften Pflanzen bewerten:

{{reviewUrl}}

Vielen Dank,
Ihr Green-Angels-Team`,
  },
  en: {
    subject: 'Rate your Green Angels order {{orderNumber}}',
    body: `Hello {{customerName}},

thank you for your purchase at Green Angels (order {{orderNumber}}).

We would appreciate your feedback. You can rate your overall purchase and the plants you bought:

{{reviewUrl}}

Thank you,
the Green Angels team`,
  },
  hu: {
    subject: 'Értékelje Green Angels rendelését {{orderNumber}}',
    body: `Tisztelt {{customerName}}!

Köszönjük vásárlását a Green Angelsnél (rendelés: {{orderNumber}}).

Örömmel fogadjuk visszajelzését. Értékelheti a teljes vásárlást és a megvásárolt növényeket:

{{reviewUrl}}

Köszönjük,
a Green Angels csapata`,
  },
  uk: {
    subject: 'Оцініть замовлення Green Angels {{orderNumber}}',
    body: `Вітаємо, {{customerName}}!

Дякуємо за покупку в Green Angels (замовлення {{orderNumber}}).

Будемо вдячні за відгук. Ви можете оцінити загальну покупку та придбані рослини:

{{reviewUrl}}

Дякуємо,
команда Green Angels`,
  },
}

export const DEFAULT_REVIEWS_SETTINGS: ReviewsSettings = {
  postPurchaseRequestsEnabled: true,
  automaticSendingEnabled: false,
  trigger: 'SHIPPED_PLUS_DELAY',
  delayDays: 7,
  tokenValidityDays: 180,
  requestEmailTemplates: { ...REQUEST_TEMPLATES },
}

export function resolveReviewRequestTemplate(
  templates: Partial<Record<AppLocale, ReviewRequestEmailTemplate>> | undefined,
  locale: string | null | undefined,
): ReviewRequestEmailTemplate {
  const normalized = (locale ?? '').slice(0, 2).toLowerCase() as AppLocale
  return (
    templates?.[normalized] ??
    REQUEST_TEMPLATES[normalized] ??
    templates?.en ??
    REQUEST_TEMPLATES.en
  )
}
