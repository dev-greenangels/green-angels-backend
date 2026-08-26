/** Labels for card-payment lifecycle emails — keyed by order.locale. */

export type LifecycleEmailLocale = 'uk' | 'en' | 'sk' | 'hu' | 'de' | 'cs'

type EmailCopy = {
  subject: string
  text: string
  html: string
}

export type LifecycleEmailLabels = {
  awaitingPayment: EmailCopy
  paymentReminder: EmailCopy
  cancelledUnpaid: EmailCopy
  latePayRefund: EmailCopy
}

const LABELS: Record<LifecycleEmailLocale, LifecycleEmailLabels> = {
  uk: {
    awaitingPayment: {
      subject: 'Очікуємо оплату — замовлення {{orderNumber}}',
      text: 'Дякуємо за замовлення {{orderNumber}}.\n\nОплатіть замовлення протягом 30 хвилин:\n{{resumeUrl}}\n\nЯкщо ви вже оплатили — ігноруйте цей лист.',
      html: `
      <p>Дякуємо за замовлення <strong>{{orderNumber}}</strong>.</p>
      <p>Оплатіть замовлення протягом <strong>30 хвилин</strong>.</p>
      <p><a href="{{resumeUrl}}">Продовжити оплату</a></p>
      <p>Якщо ви вже оплатили — ігноруйте цей лист.</p>
    `.trim(),
    },
    paymentReminder: {
      subject: 'Нагадування: оплатіть замовлення {{orderNumber}}',
      text: 'Нагадуємо: замовлення {{orderNumber}} ще очікує оплату.\n\nПродовжити оплату:\n{{resumeUrl}}\n\nНевдовзі неоплачене замовлення буде скасовано.',
      html: `
      <p>Нагадуємо: замовлення <strong>{{orderNumber}}</strong> ще очікує оплату.</p>
      <p><a href="{{resumeUrl}}">Продовжити оплату</a></p>
      <p>Невдовзі неоплачене замовлення буде скасовано.</p>
    `.trim(),
    },
    cancelledUnpaid: {
      subject: 'Замовлення {{orderNumber}} скасовано',
      text: 'Замовлення {{orderNumber}} скасовано, бо оплату не було завершено вчасно.\n\nВи можете оформити нове замовлення: {{shopUrl}}',
      html: `
      <p>Замовлення <strong>{{orderNumber}}</strong> скасовано, бо оплату не було завершено вчасно.</p>
      <p><a href="{{shopUrl}}">Перейти до магазину</a></p>
    `.trim(),
    },
    latePayRefund: {
      subject: 'Повернення коштів — замовлення {{orderNumber}}',
      text: 'Оплату за замовленням {{orderNumber}} отримано після скасування замовлення.\n\nКошти буде повернуто. Замовлення не буде виконано.\n\nМагазин: {{shopUrl}}',
      html: `
      <p>Оплату за замовленням <strong>{{orderNumber}}</strong> отримано після скасування.</p>
      <p>Кошти буде повернуто. Замовлення не буде виконано.</p>
      <p><a href="{{shopUrl}}">Перейти до магазину</a></p>
    `.trim(),
    },
  },
  en: {
    awaitingPayment: {
      subject: 'Awaiting payment — order {{orderNumber}}',
      text: 'Thank you for order {{orderNumber}}.\n\nPlease pay within 30 minutes:\n{{resumeUrl}}\n\nIf you have already paid, ignore this email.',
      html: `
      <p>Thank you for order <strong>{{orderNumber}}</strong>.</p>
      <p>Please pay within <strong>30 minutes</strong>.</p>
      <p><a href="{{resumeUrl}}">Continue payment</a></p>
      <p>If you have already paid, ignore this email.</p>
    `.trim(),
    },
    paymentReminder: {
      subject: 'Reminder: pay for order {{orderNumber}}',
      text: 'Reminder: order {{orderNumber}} is still awaiting payment.\n\nContinue payment:\n{{resumeUrl}}\n\nThe unpaid order will be cancelled soon.',
      html: `
      <p>Reminder: order <strong>{{orderNumber}}</strong> is still awaiting payment.</p>
      <p><a href="{{resumeUrl}}">Continue payment</a></p>
      <p>The unpaid order will be cancelled soon.</p>
    `.trim(),
    },
    cancelledUnpaid: {
      subject: 'Order {{orderNumber}} cancelled',
      text: 'Order {{orderNumber}} was cancelled because payment was not completed in time.\n\nYou can place a new order: {{shopUrl}}',
      html: `
      <p>Order <strong>{{orderNumber}}</strong> was cancelled because payment was not completed in time.</p>
      <p><a href="{{shopUrl}}">Go to the shop</a></p>
    `.trim(),
    },
    latePayRefund: {
      subject: 'Refund — order {{orderNumber}}',
      text: 'Payment for order {{orderNumber}} was received after the order was cancelled.\n\nThe funds will be refunded. The order will not be fulfilled.\n\nShop: {{shopUrl}}',
      html: `
      <p>Payment for order <strong>{{orderNumber}}</strong> was received after cancellation.</p>
      <p>The funds will be refunded. The order will not be fulfilled.</p>
      <p><a href="{{shopUrl}}">Go to the shop</a></p>
    `.trim(),
    },
  },
  sk: {
    awaitingPayment: {
      subject: 'Čakáme na platbu — objednávka {{orderNumber}}',
      text: 'Ďakujeme za objednávku {{orderNumber}}.\n\nZaplaťte do 30 minút:\n{{resumeUrl}}\n\nAk ste už zaplatili, tento e-mail ignorujte.',
      html: `
      <p>Ďakujeme za objednávku <strong>{{orderNumber}}</strong>.</p>
      <p>Zaplaťte do <strong>30 minút</strong>.</p>
      <p><a href="{{resumeUrl}}">Pokračovať v platbe</a></p>
      <p>Ak ste už zaplatili, tento e-mail ignorujte.</p>
    `.trim(),
    },
    paymentReminder: {
      subject: 'Pripomienka: zaplaťte objednávku {{orderNumber}}',
      text: 'Pripomíname: objednávka {{orderNumber}} stále čaká na platbu.\n\nPokračovať v platbe:\n{{resumeUrl}}\n\nNezaplatená objednávka bude čoskoro zrušená.',
      html: `
      <p>Pripomíname: objednávka <strong>{{orderNumber}}</strong> stále čaká na platbu.</p>
      <p><a href="{{resumeUrl}}">Pokračovať v platbe</a></p>
      <p>Nezaplatená objednávka bude čoskoro zrušená.</p>
    `.trim(),
    },
    cancelledUnpaid: {
      subject: 'Objednávka {{orderNumber}} zrušená',
      text: 'Objednávka {{orderNumber}} bola zrušená, pretože platba nebola dokončená včas.\n\nMôžete vytvoriť novú objednávku: {{shopUrl}}',
      html: `
      <p>Objednávka <strong>{{orderNumber}}</strong> bola zrušená, pretože platba nebola dokončená včas.</p>
      <p><a href="{{shopUrl}}">Prejsť do obchodu</a></p>
    `.trim(),
    },
    latePayRefund: {
      subject: 'Vrátenie peňazí — objednávka {{orderNumber}}',
      text: 'Platba za objednávku {{orderNumber}} bola prijatá po zrušení objednávky.\n\nPeniaze budú vrátené. Objednávka nebude vybavená.\n\nObchod: {{shopUrl}}',
      html: `
      <p>Platba za objednávku <strong>{{orderNumber}}</strong> bola prijatá po zrušení.</p>
      <p>Peniaze budú vrátené. Objednávka nebude vybavená.</p>
      <p><a href="{{shopUrl}}">Prejsť do obchodu</a></p>
    `.trim(),
    },
  },
  hu: {
    awaitingPayment: {
      subject: 'Fizetésre várunk — {{orderNumber}} rendelés',
      text: 'Köszönjük a(z) {{orderNumber}} rendelést.\n\nFizessen 30 percen belül:\n{{resumeUrl}}\n\nHa már fizetett, hagyja figyelmen kívül ezt az e-mailt.',
      html: `
      <p>Köszönjük a(z) <strong>{{orderNumber}}</strong> rendelést.</p>
      <p>Fizessen <strong>30 percen</strong> belül.</p>
      <p><a href="{{resumeUrl}}">Fizetés folytatása</a></p>
      <p>Ha már fizetett, hagyja figyelmen kívül ezt az e-mailt.</p>
    `.trim(),
    },
    paymentReminder: {
      subject: 'Emlékeztető: fizesse ki a(z) {{orderNumber}} rendelést',
      text: 'Emlékeztető: a(z) {{orderNumber}} rendelés még fizetésre vár.\n\nFizetés folytatása:\n{{resumeUrl}}\n\nA ki nem fizetett rendelést hamarosan töröljük.',
      html: `
      <p>Emlékeztető: a(z) <strong>{{orderNumber}}</strong> rendelés még fizetésre vár.</p>
      <p><a href="{{resumeUrl}}">Fizetés folytatása</a></p>
      <p>A ki nem fizetett rendelést hamarosan töröljük.</p>
    `.trim(),
    },
    cancelledUnpaid: {
      subject: '{{orderNumber}} rendelés törölve',
      text: 'A(z) {{orderNumber}} rendelést töröltük, mert a fizetés nem készült el időben.\n\nÚj rendelést adhat le: {{shopUrl}}',
      html: `
      <p>A(z) <strong>{{orderNumber}}</strong> rendelést töröltük, mert a fizetés nem készült el időben.</p>
      <p><a href="{{shopUrl}}">Ugrás a boltba</a></p>
    `.trim(),
    },
    latePayRefund: {
      subject: 'Visszatérítés — {{orderNumber}} rendelés',
      text: 'A(z) {{orderNumber}} rendelés kifizetése a törlés után érkezett meg.\n\nAz összeget visszatérítjük. A rendelést nem teljesítjük.\n\nBolt: {{shopUrl}}',
      html: `
      <p>A(z) <strong>{{orderNumber}}</strong> rendelés kifizetése a törlés után érkezett meg.</p>
      <p>Az összeget visszatérítjük. A rendelést nem teljesítjük.</p>
      <p><a href="{{shopUrl}}">Ugrás a boltba</a></p>
    `.trim(),
    },
  },
  de: {
    awaitingPayment: {
      subject: 'Zahlung ausstehend — Bestellung {{orderNumber}}',
      text: 'Danke für Ihre Bestellung {{orderNumber}}.\n\nBitte zahlen Sie innerhalb von 30 Minuten:\n{{resumeUrl}}\n\nFalls Sie bereits bezahlt haben, ignorieren Sie diese E-Mail.',
      html: `
      <p>Danke für Ihre Bestellung <strong>{{orderNumber}}</strong>.</p>
      <p>Bitte zahlen Sie innerhalb von <strong>30 Minuten</strong>.</p>
      <p><a href="{{resumeUrl}}">Zahlung fortsetzen</a></p>
      <p>Falls Sie bereits bezahlt haben, ignorieren Sie diese E-Mail.</p>
    `.trim(),
    },
    paymentReminder: {
      subject: 'Erinnerung: Bestellung {{orderNumber}} bezahlen',
      text: 'Erinnerung: Bestellung {{orderNumber}} wartet noch auf Zahlung.\n\nZahlung fortsetzen:\n{{resumeUrl}}\n\nDie unbezahlte Bestellung wird bald storniert.',
      html: `
      <p>Erinnerung: Bestellung <strong>{{orderNumber}}</strong> wartet noch auf Zahlung.</p>
      <p><a href="{{resumeUrl}}">Zahlung fortsetzen</a></p>
      <p>Die unbezahlte Bestellung wird bald storniert.</p>
    `.trim(),
    },
    cancelledUnpaid: {
      subject: 'Bestellung {{orderNumber}} storniert',
      text: 'Bestellung {{orderNumber}} wurde storniert, weil die Zahlung nicht rechtzeitig abgeschlossen wurde.\n\nSie können eine neue Bestellung aufgeben: {{shopUrl}}',
      html: `
      <p>Bestellung <strong>{{orderNumber}}</strong> wurde storniert, weil die Zahlung nicht rechtzeitig abgeschlossen wurde.</p>
      <p><a href="{{shopUrl}}">Zum Shop</a></p>
    `.trim(),
    },
    latePayRefund: {
      subject: 'Rückerstattung — Bestellung {{orderNumber}}',
      text: 'Die Zahlung für Bestellung {{orderNumber}} ist nach der Stornierung eingegangen.\n\nDer Betrag wird erstattet. Die Bestellung wird nicht ausgeführt.\n\nShop: {{shopUrl}}',
      html: `
      <p>Die Zahlung für Bestellung <strong>{{orderNumber}}</strong> ist nach der Stornierung eingegangen.</p>
      <p>Der Betrag wird erstattet. Die Bestellung wird nicht ausgeführt.</p>
      <p><a href="{{shopUrl}}">Zum Shop</a></p>
    `.trim(),
    },
  },
  cs: {
    awaitingPayment: {
      subject: 'Čekáme na platbu — objednávka {{orderNumber}}',
      text: 'Děkujeme za objednávku {{orderNumber}}.\n\nZaplaťte do 30 minut:\n{{resumeUrl}}\n\nPokud jste již zaplatili, tento e-mail ignorujte.',
      html: `
      <p>Děkujeme za objednávku <strong>{{orderNumber}}</strong>.</p>
      <p>Zaplaťte do <strong>30 minut</strong>.</p>
      <p><a href="{{resumeUrl}}">Pokračovat v platbě</a></p>
      <p>Pokud jste již zaplatili, tento e-mail ignorujte.</p>
    `.trim(),
    },
    paymentReminder: {
      subject: 'Připomínka: zaplaťte objednávku {{orderNumber}}',
      text: 'Připomínáme: objednávka {{orderNumber}} stále čeká na platbu.\n\nPokračovat v platbě:\n{{resumeUrl}}\n\nNezaplacená objednávka bude brzy zrušena.',
      html: `
      <p>Připomínáme: objednávka <strong>{{orderNumber}}</strong> stále čeká na platbu.</p>
      <p><a href="{{resumeUrl}}">Pokračovat v platbě</a></p>
      <p>Nezaplacená objednávka bude brzy zrušena.</p>
    `.trim(),
    },
    cancelledUnpaid: {
      subject: 'Objednávka {{orderNumber}} zrušena',
      text: 'Objednávka {{orderNumber}} byla zrušena, protože platba nebyla dokončena včas.\n\nMůžete vytvořit novou objednávku: {{shopUrl}}',
      html: `
      <p>Objednávka <strong>{{orderNumber}}</strong> byla zrušena, protože platba nebyla dokončena včas.</p>
      <p><a href="{{shopUrl}}">Přejít do obchodu</a></p>
    `.trim(),
    },
    latePayRefund: {
      subject: 'Vrácení peněz — objednávka {{orderNumber}}',
      text: 'Platba za objednávku {{orderNumber}} byla přijata po zrušení objednávky.\n\nPeněze budou vráceny. Objednávka nebude vyřízena.\n\nObchod: {{shopUrl}}',
      html: `
      <p>Platba za objednávku <strong>{{orderNumber}}</strong> byla přijata po zrušení.</p>
      <p>Peněze budou vráceny. Objednávka nebude vyřízena.</p>
      <p><a href="{{shopUrl}}">Přejít do obchodu</a></p>
    `.trim(),
    },
  },
}

export function resolveLifecycleEmailLocale(raw?: string | null): LifecycleEmailLocale {
  const code = (raw ?? '').trim().toLowerCase().slice(0, 2)
  if (code === 'uk' || code === 'en' || code === 'sk' || code === 'hu' || code === 'de' || code === 'cs') {
    return code
  }
  return 'en'
}

export function getLifecycleEmailLabels(locale: LifecycleEmailLocale): LifecycleEmailLabels {
  return LABELS[locale]
}

export function fillLifecycleEmailTemplate(
  template: string,
  vars: { orderNumber: string; resumeUrl?: string; shopUrl?: string },
): string {
  return template
    .replaceAll('{{orderNumber}}', vars.orderNumber)
    .replaceAll('{{resumeUrl}}', vars.resumeUrl ?? '')
    .replaceAll('{{shopUrl}}', vars.shopUrl ?? '')
}
