/** Order confirmation cover email — keyed by order.locale. */

export type OrderConfirmationEmailLocale = 'uk' | 'en' | 'sk' | 'hu' | 'de' | 'cs'

type ConfirmationCopy = {
  subject: string
  text: string
  html: string
  /** Shown only when order.codFeeAmount > 0. Placeholders: {{codFeeLabel}} {{codFeeAmount}} */
  codFeeText?: string
  codFeeHtml?: string
  codFeeLabel: string
}

const LABELS: Record<OrderConfirmationEmailLocale, ConfirmationCopy> = {
  uk: {
    subject: 'Підтвердження замовлення {{orderNumber}}',
    text: 'Дякуємо за замовлення {{orderNumber}}. У вкладенні — PDF-підтвердження.',
    html: `
      <p>Дякуємо за замовлення <strong>{{orderNumber}}</strong>.</p>
      <p>У вкладенні — PDF-підтвердження замовлення.</p>
    `.trim(),
    codFeeLabel: 'Комісія за післяплату',
    codFeeText: 'Комісія за післяплату: {{codFeeAmount}} (включено в загальну суму).',
    codFeeHtml: '<p>Комісія за післяплату: <strong>{{codFeeAmount}}</strong> (включено в загальну суму).</p>',
  },
  en: {
    subject: 'Order confirmation {{orderNumber}}',
    text: 'Thank you for order {{orderNumber}}. Please find the PDF confirmation attached.',
    html: `
      <p>Thank you for order <strong>{{orderNumber}}</strong>.</p>
      <p>Please find the PDF confirmation attached.</p>
    `.trim(),
    codFeeLabel: 'COD fee',
    codFeeText: 'COD fee: {{codFeeAmount}} (included in the total).',
    codFeeHtml: '<p>COD fee: <strong>{{codFeeAmount}}</strong> (included in the total).</p>',
  },
  sk: {
    subject: 'Potvrdenie objednávky {{orderNumber}}',
    text: 'Ďakujeme za objednávku {{orderNumber}}. V prílohe nájdete PDF potvrdenie.',
    html: `
      <p>Ďakujeme za objednávku <strong>{{orderNumber}}</strong>.</p>
      <p>V prílohe nájdete PDF potvrdenie.</p>
    `.trim(),
    codFeeLabel: 'Poplatok za dobierku',
    codFeeText: 'Poplatok za dobierku: {{codFeeAmount}} (zahrnutý v celkovej sume).',
    codFeeHtml: '<p>Poplatok za dobierku: <strong>{{codFeeAmount}}</strong> (zahrnutý v celkovej sume).</p>',
  },
  cs: {
    subject: 'Potvrzení objednávky {{orderNumber}}',
    text: 'Děkujeme za objednávku {{orderNumber}}. V příloze najdete PDF potvrzení.',
    html: `
      <p>Děkujeme za objednávku <strong>{{orderNumber}}</strong>.</p>
      <p>V příloze najdete PDF potvrzení.</p>
    `.trim(),
    codFeeLabel: 'Poplatek za dobírku',
    codFeeText: 'Poplatek za dobírku: {{codFeeAmount}} (zahrnutý v celkové částce).',
    codFeeHtml: '<p>Poplatek za dobírku: <strong>{{codFeeAmount}}</strong> (zahrnutý v celkové částce).</p>',
  },
  hu: {
    subject: 'Rendelés visszaigazolása {{orderNumber}}',
    text: 'Köszönjük a {{orderNumber}} számú rendelését. A PDF visszaigazolás a mellékletben található.',
    html: `
      <p>Köszönjük a <strong>{{orderNumber}}</strong> számú rendelését.</p>
      <p>A PDF visszaigazolás a mellékletben található.</p>
    `.trim(),
    codFeeLabel: 'Utánvéti díj',
    codFeeText: 'Utánvéti díj: {{codFeeAmount}} (a végösszegben szerepel).',
    codFeeHtml: '<p>Utánvéti díj: <strong>{{codFeeAmount}}</strong> (a végösszegben szerepel).</p>',
  },
  de: {
    subject: 'Bestellbestätigung {{orderNumber}}',
    text: 'Danke für Ihre Bestellung {{orderNumber}}. Die PDF-Bestätigung finden Sie im Anhang.',
    html: `
      <p>Danke für Ihre Bestellung <strong>{{orderNumber}}</strong>.</p>
      <p>Die PDF-Bestätigung finden Sie im Anhang.</p>
    `.trim(),
    codFeeLabel: 'Nachnahmegebühr',
    codFeeText: 'Nachnahmegebühr: {{codFeeAmount}} (im Gesamtbetrag enthalten).',
    codFeeHtml: '<p>Nachnahmegebühr: <strong>{{codFeeAmount}}</strong> (im Gesamtbetrag enthalten).</p>',
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

export function appendCodFeeToConfirmationEmail(input: {
  text: string
  html: string
  locale: OrderConfirmationEmailLocale
  codFeeAmount: number
  currency: string
}): { text: string; html: string } {
  if (!(input.codFeeAmount > 0)) {
    return { text: input.text, html: input.html }
  }
  const copy = getOrderConfirmationEmailCopy(input.locale)
  const amount = `${input.codFeeAmount.toFixed(2)} ${input.currency}`
  const feeText = (copy.codFeeText ?? '').replaceAll('{{codFeeAmount}}', amount)
  const feeHtml = (copy.codFeeHtml ?? '').replaceAll('{{codFeeAmount}}', amount)
  return {
    text: feeText ? `${input.text}\n${feeText}` : input.text,
    html: feeHtml ? `${input.html}\n${feeHtml}` : input.html,
  }
}
