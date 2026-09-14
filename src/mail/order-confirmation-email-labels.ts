/** Order confirmation cover email — keyed by order.locale. */

export type OrderConfirmationEmailLocale = 'uk' | 'en' | 'sk' | 'hu' | 'de' | 'cs'

type ConfirmationCopy = {
  subject: string
  text: string
  html: string
}

const LABELS: Record<OrderConfirmationEmailLocale, ConfirmationCopy> = {
  uk: {
    subject: 'Підтвердження замовлення {{orderNumber}}',
    text: 'Дякуємо за замовлення {{orderNumber}}. У вкладенні — PDF-підтвердження.',
    html: `
      <p>Дякуємо за замовлення <strong>{{orderNumber}}</strong>.</p>
      <p>У вкладенні — PDF-підтвердження замовлення.</p>
    `.trim(),
  },
  en: {
    subject: 'Order confirmation {{orderNumber}}',
    text: 'Thank you for order {{orderNumber}}. Please find the PDF confirmation attached.',
    html: `
      <p>Thank you for order <strong>{{orderNumber}}</strong>.</p>
      <p>Please find the PDF confirmation attached.</p>
    `.trim(),
  },
  sk: {
    subject: 'Potvrdenie objednávky {{orderNumber}}',
    text: 'Ďakujeme za objednávku {{orderNumber}}. V prílohe nájdete PDF potvrdenie.',
    html: `
      <p>Ďakujeme za objednávku <strong>{{orderNumber}}</strong>.</p>
      <p>V prílohe nájdete PDF potvrdenie.</p>
    `.trim(),
  },
  cs: {
    subject: 'Potvrzení objednávky {{orderNumber}}',
    text: 'Děkujeme za objednávku {{orderNumber}}. V příloze najdete PDF potvrzení.',
    html: `
      <p>Děkujeme za objednávku <strong>{{orderNumber}}</strong>.</p>
      <p>V příloze najdete PDF potvrzení.</p>
    `.trim(),
  },
  hu: {
    subject: 'Rendelés visszaigazolása {{orderNumber}}',
    text: 'Köszönjük a {{orderNumber}} számú rendelését. A PDF visszaigazolás a mellékletben található.',
    html: `
      <p>Köszönjük a <strong>{{orderNumber}}</strong> számú rendelését.</p>
      <p>A PDF visszaigazolás a mellékletben található.</p>
    `.trim(),
  },
  de: {
    subject: 'Bestellbestätigung {{orderNumber}}',
    text: 'Danke für Ihre Bestellung {{orderNumber}}. Die PDF-Bestätigung finden Sie im Anhang.',
    html: `
      <p>Danke für Ihre Bestellung <strong>{{orderNumber}}</strong>.</p>
      <p>Die PDF-Bestätigung finden Sie im Anhang.</p>
    `.trim(),
  },
}

export function resolveOrderConfirmationEmailLocale(
  raw?: string | null,
): OrderConfirmationEmailLocale {
  const code = (raw ?? '').trim().toLowerCase().slice(0, 2)
  if (code === 'uk' || code === 'en' || code === 'sk' || code === 'hu' || code === 'de' || code === 'cs') {
    return code
  }
  return 'en'
}

export function getOrderConfirmationEmailCopy(
  locale: OrderConfirmationEmailLocale,
): ConfirmationCopy {
  return LABELS[locale]
}

export function fillOrderConfirmationEmailTemplate(
  template: string,
  orderNumber: string,
): string {
  return template.replaceAll('{{orderNumber}}', orderNumber)
}
