import type { AppLocale } from './localization.types'

export type WithdrawalReturnAddressMode = 'store' | 'custom'

export type WithdrawalStructuredAddress = {
  organizationName: string
  street: string
  city: string
  postalCode: string
  country: string
}

export type WithdrawalAcknowledgementTemplate = {
  subject: string
  body: string
}

export type WithdrawalSettings = {
  returnAddressMode: WithdrawalReturnAddressMode
  customReturnAddress: WithdrawalStructuredAddress
  acknowledgementTemplates: Partial<Record<AppLocale, WithdrawalAcknowledgementTemplate>>
  /** Account order-detail CTA visibility window after deliveredAt (UI only). */
  accountWithdrawalWindowDays: number
}

export const DEFAULT_WITHDRAWAL_STRUCTURED_ADDRESS: WithdrawalStructuredAddress = {
  organizationName: '',
  street: '',
  city: '',
  postalCode: '',
  country: '',
}

const ACK_TEMPLATES: Record<AppLocale, WithdrawalAcknowledgementTemplate> = {
  sk: {
    subject: 'Potvrdenie prijatia oznámenia o odstúpení od zmluvy — {{withdrawalReference}}',
    body: `Dobrý deň, {{customerName}},

týmto potvrdzujeme, že sme dňa {{submittedAt}} prijali a zaznamenali vaše oznámenie o odstúpení od zmluvy (referencia: {{withdrawalReference}}) k objednávke č. {{orderNumber}}.

Rozsah odstúpenia: {{withdrawalScope}}
{{partialItems}}

Toto potvrdenie potvrdzuje prijatie vášho oznámenia o odstúpení od zmluvy. Neznamená potvrdenie prijatia vráteného tovaru ani vykonanie vrátenia platby.

Ďalší postup spracujeme v súlade s platnými právnymi predpismi. Ak budeme potrebovať doplňujúce informácie, budeme vás kontaktovať.

Adresa na vrátenie tovaru:
{{returnAddress}}

{{sellerName}}
{{supportEmail}}`,
  },
  en: {
    subject: 'Confirmation of receipt of withdrawal notice — {{withdrawalReference}}',
    body: `Dear {{customerName}},

We hereby confirm that on {{submittedAt}} we received and recorded your notice of withdrawal from the contract (reference: {{withdrawalReference}}) for order no. {{orderNumber}}.

Scope of withdrawal: {{withdrawalScope}}
{{partialItems}}

This confirmation acknowledges receipt of your notice of withdrawal from the contract. It does not confirm receipt of returned goods or that a refund has been made.

We will handle the next steps in accordance with applicable law. If we need further information, we will contact you.

Return address for the goods:
{{returnAddress}}

{{sellerName}}
{{supportEmail}}`,
  },
  hu: {
    subject: 'Elállási nyilatkozat átvételének visszaigazolása — {{withdrawalReference}}',
    body: `Tisztelt {{customerName}}!

Ezúton megerősítjük, hogy {{submittedAt}} napján átvettük és rögzítettük a szerződéstől való elállásra vonatkozó nyilatkozatát (hivatkozás: {{withdrawalReference}}) a(z) {{orderNumber}} számú rendeléshez.

Az elállás terjedelme: {{withdrawalScope}}
{{partialItems}}

Ez a visszaigazolás a szerződéstől való elállásra vonatkozó nyilatkozata átvételét igazolja. Nem jelenti a visszaküldött áru átvételének, sem a fizetés visszatérítésének megerősítését.

A további lépéseket a hatályos jogszabályoknak megfelelően intézzük. Ha kiegészítő információra lesz szükségünk, felvesszük Önnel a kapcsolatot.

Áru visszaküldési címe:
{{returnAddress}}

{{sellerName}}
{{supportEmail}}`,
  },
  de: {
    subject: 'Bestätigung des Eingangs der Widerrufsmitteilung — {{withdrawalReference}}',
    body: `Guten Tag, {{customerName}},

hiermit bestätigen wir, dass wir am {{submittedAt}} Ihre Mitteilung über den Widerruf des Vertrags (Referenz: {{withdrawalReference}}) zur Bestellung Nr. {{orderNumber}} erhalten und erfasst haben.

Umfang des Widerrufs: {{withdrawalScope}}
{{partialItems}}

Diese Bestätigung bestätigt den Empfang Ihrer Mitteilung über den Widerruf des Vertrags. Sie bedeutet weder die Bestätigung des Empfangs zurückgesandter Ware noch die Durchführung einer Erstattung.

Die weiteren Schritte bearbeiten wir gemäß den geltenden Rechtsvorschriften. Wenn wir ergänzende Informationen benötigen, werden wir Sie kontaktieren.

Rücksendeadresse für die Ware:
{{returnAddress}}

{{sellerName}}
{{supportEmail}}`,
  },
  cs: {
    subject: 'Potvrzení přijetí oznámení o odstoupení od smlouvy — {{withdrawalReference}}',
    body: `Dobrý den, {{customerName}},

tímto potvrzujeme, že jsme dne {{submittedAt}} přijali a zaznamenali vaše oznámení o odstoupení od smlouvy (reference: {{withdrawalReference}}) k objednávce č. {{orderNumber}}.

Rozsah odstoupení: {{withdrawalScope}}
{{partialItems}}

Toto potvrzení potvrzuje přijetí vašeho oznámení o odstoupení od smlouvy. Neznamená potvrzení přijetí vráceného zboží ani provedení vrácení platby.

Další postup zpracujeme v souladu s platnými právními předpisy. Pokud budeme potřebovat doplňující informace, budeme vás kontaktovat.

Adresa pro vrácení zboží:
{{returnAddress}}

{{sellerName}}
{{supportEmail}}`,
  },
  uk: {
    subject: 'Підтвердження отримання повідомлення про відмову від договору — {{withdrawalReference}}',
    body: `Вітаємо, {{customerName}}!

Цим підтверджуємо, що {{submittedAt}} ми отримали та зафіксували ваше повідомлення про відмову від договору (референція: {{withdrawalReference}}) щодо замовлення № {{orderNumber}}.

Обсяг відмови: {{withdrawalScope}}
{{partialItems}}

Це підтвердження засвідчує отримання вашого повідомлення про відмову від договору. Воно не означає підтвердження отримання повернутого товару чи здійснення повернення платежу.

Подальші кроки ми опрацюємо відповідно до чинного законодавства. Якщо нам знадобляться додаткові відомості, ми з вами зв’яжемося.

Адреса для повернення товару:
{{returnAddress}}

{{sellerName}}
{{supportEmail}}`,
  },
}

export const DEFAULT_WITHDRAWAL_SETTINGS: WithdrawalSettings = {
  returnAddressMode: 'store',
  customReturnAddress: { ...DEFAULT_WITHDRAWAL_STRUCTURED_ADDRESS },
  acknowledgementTemplates: { ...ACK_TEMPLATES },
  accountWithdrawalWindowDays: 14,
}

/** Resolve acknowledgement template by withdrawal/order locale; unknown → en. */
export function resolveWithdrawalAckTemplate(
  templates: Partial<Record<AppLocale, WithdrawalAcknowledgementTemplate>> | undefined,
  locale: string | null | undefined,
): WithdrawalAcknowledgementTemplate {
  const normalized = (locale ?? '').slice(0, 2).toLowerCase() as AppLocale
  return (
    templates?.[normalized] ??
    ACK_TEMPLATES[normalized] ??
    templates?.en ??
    ACK_TEMPLATES.en
  )
}
