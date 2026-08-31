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

Rozsah: {{withdrawalScope}}
{{partialItems}}

Toto potvrdenie neznamená automatické schválenie odstúpenia, vrátenie platby ani prijatie tovaru. Vašu žiadosť posúdime v súlade so zákonom a budeme vás kontaktovať, ak budeme potrebovať ďalšie informácie.

Adresa na vrátenie tovaru (ak bude relevantné):
{{returnAddress}}

{{sellerName}}
{{supportEmail}}`,
  },
  cs: {
    subject: 'Potvrzení přijetí oznámení o odstoupení od smlouvy — {{withdrawalReference}}',
    body: `Dobrý den, {{customerName}},

tímto potvrzujeme, že jsme dne {{submittedAt}} přijali a zaznamenali vaše oznámení o odstoupení od smlouvy (reference: {{withdrawalReference}}) k objednávce č. {{orderNumber}}.

Rozsah: {{withdrawalScope}}
{{partialItems}}

Toto potvrzení neznamená automatické schválení odstoupení, vrácení platby ani přijetí zboží. Vaši žádost posoudíme v souladu se zákonem a budeme vás kontaktovat, pokud budeme potřebovat další informace.

Adresa pro vrácení zboží (pokud bude relevantní):
{{returnAddress}}

{{sellerName}}
{{supportEmail}}`,
  },
  hu: {
    subject: 'Elállási nyilatkozat beérkezett — {{withdrawalReference}}',
    body: `Tisztelt {{customerName}}!

Megerősítjük, hogy {{submittedAt}} időpontban beérkezett és rögzítésre került távollevő szerződésből való elállási nyilatkozata (hivatkozás: {{withdrawalReference}}) a(z) {{orderNumber}} számú rendeléshez.

Terjedelem: {{withdrawalScope}}
{{partialItems}}

Ez a visszaigazolás nem jelenti az elállás automatikus jóváhagyását, a vételár visszatérítését vagy az áru átvételét. Kérelmét a jogszabályoknak megfelelően bíráljuk el, és szükség esetén felvesszük Önnel a kapcsolatot.

Visszaküldési cím (ha releváns):
{{returnAddress}}

{{sellerName}}
{{supportEmail}}`,
  },
  de: {
    subject: 'Widerrufserklärung eingegangen — {{withdrawalReference}}',
    body: `Guten Tag, {{customerName}},

hiermit bestätigen wir, dass wir am {{submittedAt}} Ihre Widerrufserklärung zum Fernabsatzvertrag (Referenz: {{withdrawalReference}}) für die Bestellung Nr. {{orderNumber}} erhalten und erfasst haben.

Umfang: {{withdrawalScope}}
{{partialItems}}

Diese Bestätigung bedeutet nicht die automatische Annahme des Widerrufs, die Erstattung der Zahlung oder die Annahme zurückgesandter Waren. Wir prüfen Ihr Anliegen gemäß den gesetzlichen Vorschriften und melden uns bei Bedarf.

Rücksendeadresse (falls zutreffend):
{{returnAddress}}

{{sellerName}}
{{supportEmail}}`,
  },
  en: {
    subject: 'Withdrawal notice received — {{withdrawalReference}}',
    body: `Dear {{customerName}},

We confirm that on {{submittedAt}} we received and recorded your notice of withdrawal from the distance contract (reference: {{withdrawalReference}}) for order no. {{orderNumber}}.

Scope: {{withdrawalScope}}
{{partialItems}}

This confirmation does not mean automatic approval of withdrawal, refund, or acceptance of returned goods. We will review your request in accordance with applicable law and contact you if we need further information.

Return address (if applicable):
{{returnAddress}}

{{sellerName}}
{{supportEmail}}`,
  },
  uk: {
    subject: 'Підтвердження отримання заяви про відмову від договору — {{withdrawalReference}}',
    body: `Вітаємо, {{customerName}}!

Підтверджуємо, що {{submittedAt}} ми отримали та зафіксували вашу заяву про відмову від договору, укладеного дистанційно (референція: {{withdrawalReference}}), щодо замовлення № {{orderNumber}}.

Обсяг: {{withdrawalScope}}
{{partialItems}}

Це підтвердження не означає автоматичного схвалення відмови від договору, повернення коштів чи прийняття товару. Ми розглянемо ваше звернення відповідно до закону та зв’яжемося з вами, якщо знадобляться додаткові відомості.

Адреса для повернення товару (за потреби):
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
