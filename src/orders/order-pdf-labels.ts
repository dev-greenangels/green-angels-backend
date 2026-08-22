/** Labels for order confirmation PDF — keyed by UI locale (market defaultLocale). */

export type OrderPdfLocale = 'uk' | 'en' | 'sk' | 'hu' | 'de' | 'cs'

type PdfLabels = {
  title: string
  order: string
  date: string
  supplier: string
  buyer: string
  shipTo: string
  delivery: string
  payment: string
  currency: string
  colDescription: string
  colQty: string
  colPrice: string
  colVat: string
  colAmount: string
  products: string
  shipping: string
  packaging: string
  codFee: string
  vatIncluded: string
  vat: string
  total: string
  shippingLine: string
  packagingLine: string
  codFeeLine: string
  pickup: string
  reverseChargeTitle: string
  reverseChargeBody: string
  footer: string[]
  paymentDetails: string
  recipient: string
  bank: string
  paymentPurpose: string
  viesValid: string
  viesInvalid: string
  viesUnavailable: string
  viesChecked: string
  viesRegistryName: string
  deliveryMethods: Record<string, string>
  paymentMethods: Record<string, string>
}

const DELIVERY: Record<string, Record<OrderPdfLocale, string>> = {
  pickup: {
    uk: 'Самовивіз',
    en: 'Pickup',
    sk: 'Osobný odber',
    hu: 'Személyes átvétel',
    de: 'Abholung',
    cs: 'Osobní odběr',
  },
  'nova-poshta-branch': {
    uk: 'Нова Пошта — відділення',
    en: 'Nova Poshta — branch',
    sk: 'Nova Poshta — pobočka',
    hu: 'Nova Poshta — fiók',
    de: 'Nova Poshta — Filiale',
    cs: 'Nova Poshta — pobočka',
  },
  'nova-poshta-address': {
    uk: 'Нова Пошта — адреса',
    en: 'Nova Poshta — address',
    sk: 'Nova Poshta — adresa',
    hu: 'Nova Poshta — cím',
    de: 'Nova Poshta — Adresse',
    cs: 'Nova Poshta — adresa',
  },
  'packeta-box': {
    uk: 'Packeta — Z-BOX / výdejní místo',
    en: 'Packeta — pickup point',
    sk: 'Packeta — výdajné miesto / Z-BOX',
    hu: 'Packeta — átvételi pont',
    de: 'Packeta — Abholpunkt',
    cs: 'Packeta — výdejní místo / Z-BOX',
  },
  'packeta-courier': {
    uk: 'Packeta — курʼєр',
    en: 'Packeta — courier',
    sk: 'Packeta — kuriér',
    hu: 'Packeta — futár',
    de: 'Packeta — Kurier',
    cs: 'Packeta — kurýr',
  },
  'gls-courier': {
    uk: 'GLS — курʼєр',
    en: 'GLS — courier',
    sk: 'GLS — kuriér',
    hu: 'GLS — futár',
    de: 'GLS — Kurier',
    cs: 'GLS — kurýr',
  },
}

const PAYMENT: Record<string, Record<OrderPdfLocale, string>> = {
  'card-online': {
    uk: 'Картка онлайн',
    en: 'Card online',
    sk: 'Karta online',
    hu: 'Online kártya',
    de: 'Karte online',
    cs: 'Karta online',
  },
  'cash-on-delivery': {
    uk: 'Накладений платіж',
    en: 'Cash on delivery',
    sk: 'Dobierka',
    hu: 'Utánvét',
    de: 'Nachnahme',
    cs: 'Dobírka',
  },
  'bank-transfer': {
    uk: 'Банківський переказ',
    en: 'Bank transfer',
    sk: 'Bankový prevod',
    hu: 'Banki átutalás',
    de: 'Banküberweisung',
    cs: 'Bankovní převod',
  },
  'bank-transfer-legal': {
    uk: 'Банківський переказ (юр. особа)',
    en: 'Bank transfer (company)',
    sk: 'Bankový prevod (firma)',
    hu: 'Banki átutalás (cég)',
    de: 'Banküberweisung (Firma)',
    cs: 'Bankovní převod (firma)',
  },
}

const LABELS: Record<OrderPdfLocale, Omit<PdfLabels, 'deliveryMethods' | 'paymentMethods'>> = {
  uk: {
    title: 'Підтвердження замовлення',
    order: 'Замовлення',
    date: 'Дата',
    supplier: 'ПРОДАВЕЦЬ',
    buyer: 'ПОКУПЕЦЬ',
    shipTo: 'АДРЕСА ДОСТАВКИ',
    delivery: 'Доставка',
    payment: 'Оплата',
    currency: 'Валюта',
    colDescription: 'Опис',
    colQty: 'К-сть',
    colPrice: 'Ціна',
    colVat: 'ПДВ %',
    colAmount: 'Сума',
    products: 'Товари',
    shipping: 'Доставка',
    packaging: 'Пакування',
    codFee: 'Післяплата',
    vatIncluded: 'ПДВ включено',
    vat: 'ПДВ',
    total: 'РАЗОМ',
    shippingLine: 'Доставка',
    packagingLine: 'Пакування',
    codFeeLine: 'Комісія післяплати',
    pickup: 'Самовивіз',
    reverseChargeTitle: 'Reverse charge — 0% ПДВ',
    reverseChargeBody: 'ПДВ обліковує отримувач згідно з правилами ЄС.',
    footer: ['Це підтвердження замовлення, не податкова накладна.'],
    paymentDetails: 'Реквізити для оплати',
    recipient: 'Одержувач',
    bank: 'Банк',
    paymentPurpose: 'Призначення платежу',
    viesValid: 'VIES: дійсний',
    viesInvalid: 'VIES: недійсний',
    viesUnavailable: 'VIES: недоступний',
    viesChecked: 'Перевірено',
    viesRegistryName: 'Назва в реєстрі',
  },
  en: {
    title: 'Order confirmation',
    order: 'Order',
    date: 'Date',
    supplier: 'SUPPLIER',
    buyer: 'BUYER',
    shipTo: 'SHIP TO',
    delivery: 'Delivery',
    payment: 'Payment',
    currency: 'Currency',
    colDescription: 'Description',
    colQty: 'Qty',
    colPrice: 'Price',
    colVat: 'VAT %',
    colAmount: 'Amount',
    products: 'Products',
    shipping: 'Shipping',
    packaging: 'Packaging',
    codFee: 'COD fee',
    vatIncluded: 'VAT included',
    vat: 'VAT',
    total: 'TOTAL',
    shippingLine: 'Shipping',
    packagingLine: 'Packaging',
    codFeeLine: 'COD fee',
    pickup: 'Pickup',
    reverseChargeTitle: 'Intra-Community supply — VAT 0%',
    reverseChargeBody: 'VAT to be accounted for by the recipient under applicable EU rules.',
    footer: ['This document is an order confirmation, not a tax invoice.'],
    paymentDetails: 'Payment details',
    recipient: 'Recipient',
    bank: 'Bank',
    paymentPurpose: 'Payment reference',
    viesValid: 'VIES: valid',
    viesInvalid: 'VIES: invalid',
    viesUnavailable: 'VIES: unavailable',
    viesChecked: 'Checked',
    viesRegistryName: 'Registered name',
  },
  sk: {
    title: 'Potvrdenie objednávky',
    order: 'Objednávka',
    date: 'Dátum',
    supplier: 'DODÁVATEĽ',
    buyer: 'ODBERATEĽ',
    shipTo: 'DODACIA ADRESA',
    delivery: 'Doprava',
    payment: 'Platba',
    currency: 'Mena',
    colDescription: 'Popis',
    colQty: 'Množ.',
    colPrice: 'Cena',
    colVat: 'DPH %',
    colAmount: 'Suma',
    products: 'Tovar',
    shipping: 'Doprava',
    packaging: 'Balenie',
    codFee: 'Dobierka',
    vatIncluded: 'DPH zahrnutá',
    vat: 'DPH',
    total: 'SPOLU',
    shippingLine: 'Doprava',
    packagingLine: 'Balenie',
    codFeeLine: 'Poplatok za dobierku',
    pickup: 'Osobný odber',
    reverseChargeTitle: 'Prenesenie daňovej povinnosti — DPH 0 %',
    reverseChargeBody: 'Daň odvedie odberateľ podľa platných predpisov EÚ.',
    footer: [
      'Toto potvrdenie nie je daňový doklad. Daňový doklad vystaví dodávateľ podľa platných predpisov SR/EÚ.',
    ],
    paymentDetails: 'Platobné údaje',
    recipient: 'Príjemca',
    bank: 'Banka',
    paymentPurpose: 'Variabilný symbol / účel',
    viesValid: 'VIES: platné',
    viesInvalid: 'VIES: neplatné',
    viesUnavailable: 'VIES: nedostupné',
    viesChecked: 'Overené',
    viesRegistryName: 'Názov v registri',
  },
  hu: {
    title: 'Rendelés megerősítése',
    order: 'Rendelés',
    date: 'Dátum',
    supplier: 'SZÁLLÍTÓ',
    buyer: 'VEVŐ',
    shipTo: 'SZÁLLÍTÁSI CÍM',
    delivery: 'Szállítás',
    payment: 'Fizetés',
    currency: 'Pénznem',
    colDescription: 'Leírás',
    colQty: 'Menny.',
    colPrice: 'Ár',
    colVat: 'ÁFA %',
    colAmount: 'Összeg',
    products: 'Termékek',
    shipping: 'Szállítás',
    packaging: 'Csomagolás',
    codFee: 'Utánvét',
    vatIncluded: 'ÁFA benne van',
    vat: 'ÁFA',
    total: 'ÖSSZESEN',
    shippingLine: 'Szállítás',
    packagingLine: 'Csomagolás',
    codFeeLine: 'Utánvéti díj',
    pickup: 'Személyes átvétel',
    reverseChargeTitle: 'Fordított adózás — 0% ÁFA',
    reverseChargeBody: 'Az ÁFÁ-t a vevő számolja el az EU szabályai szerint.',
    footer: ['Ez rendelés-megerősítés, nem adószámla.'],
    paymentDetails: 'Fizetési adatok',
    recipient: 'Kedvezményezett',
    bank: 'Bank',
    paymentPurpose: 'Közlemény',
    viesValid: 'VIES: érvényes',
    viesInvalid: 'VIES: érvénytelen',
    viesUnavailable: 'VIES: nem elérhető',
    viesChecked: 'Ellenőrizve',
    viesRegistryName: 'Nyilvántartott név',
  },
  de: {
    title: 'Bestellbestätigung',
    order: 'Bestellung',
    date: 'Datum',
    supplier: 'LIEFERANT',
    buyer: 'KÄUFER',
    shipTo: 'LIEFERADRESSE',
    delivery: 'Lieferung',
    payment: 'Zahlung',
    currency: 'Währung',
    colDescription: 'Beschreibung',
    colQty: 'Menge',
    colPrice: 'Preis',
    colVat: 'MwSt. %',
    colAmount: 'Betrag',
    products: 'Produkte',
    shipping: 'Versand',
    packaging: 'Verpackung',
    codFee: 'Nachnahme',
    vatIncluded: 'MwSt. enthalten',
    vat: 'MwSt.',
    total: 'GESAMT',
    shippingLine: 'Versand',
    packagingLine: 'Verpackung',
    codFeeLine: 'Nachnahmegebühr',
    pickup: 'Abholung',
    reverseChargeTitle: 'Steuerschuldnerschaft des Leistungsempfängers — 0 % MwSt.',
    reverseChargeBody: 'Die MwSt. wird vom Empfänger nach EU-Vorschriften abgeführt.',
    footer: ['Dies ist eine Bestellbestätigung, keine Steuerrechnung.'],
    paymentDetails: 'Zahlungsdaten',
    recipient: 'Empfänger',
    bank: 'Bank',
    paymentPurpose: 'Verwendungszweck',
    viesValid: 'VIES: gültig',
    viesInvalid: 'VIES: ungültig',
    viesUnavailable: 'VIES: nicht verfügbar',
    viesChecked: 'Geprüft',
    viesRegistryName: 'Registrierter Name',
  },
  cs: {
    title: 'Potvrzení objednávky',
    order: 'Objednávka',
    date: 'Datum',
    supplier: 'DODAVATEL',
    buyer: 'ODBĚRATEL',
    shipTo: 'DORUČOVACÍ ADRESA',
    delivery: 'Doprava',
    payment: 'Platba',
    currency: 'Měna',
    colDescription: 'Popis',
    colQty: 'Množ.',
    colPrice: 'Cena',
    colVat: 'DPH %',
    colAmount: 'Částka',
    products: 'Zboží',
    shipping: 'Doprava',
    packaging: 'Balení',
    codFee: 'Dobírka',
    vatIncluded: 'DPH zahrnuto',
    vat: 'DPH',
    total: 'CELKEM',
    shippingLine: 'Doprava',
    packagingLine: 'Balení',
    codFeeLine: 'Poplatek za dobírku',
    pickup: 'Osobní odběr',
    reverseChargeTitle: 'Přenesení daňové povinnosti — DPH 0 %',
    reverseChargeBody: 'Daň odvede odběratel podle platných předpisů EU.',
    footer: ['Toto potvrzení není daňový doklad.'],
    paymentDetails: 'Platební údaje',
    recipient: 'Příjemce',
    bank: 'Banka',
    paymentPurpose: 'Variabilní symbol / účel',
    viesValid: 'VIES: platné',
    viesInvalid: 'VIES: neplatné',
    viesUnavailable: 'VIES: nedostupné',
    viesChecked: 'Ověřeno',
    viesRegistryName: 'Název v registru',
  },
}

export function resolveOrderPdfLocale(raw?: string | null): OrderPdfLocale {
  const code = (raw ?? '').trim().toLowerCase().slice(0, 2)
  if (code === 'uk' || code === 'en' || code === 'sk' || code === 'hu' || code === 'de' || code === 'cs') {
    return code
  }
  return 'en'
}

export function getOrderPdfLabels(locale: OrderPdfLocale): PdfLabels {
  const base = LABELS[locale]
  const deliveryMethods: Record<string, string> = {}
  for (const [slug, byLocale] of Object.entries(DELIVERY)) {
    deliveryMethods[slug] = byLocale[locale]
  }
  const paymentMethods: Record<string, string> = {}
  for (const [slug, byLocale] of Object.entries(PAYMENT)) {
    paymentMethods[slug] = byLocale[locale]
  }
  return { ...base, deliveryMethods, paymentMethods }
}

export function pdfIntlLocale(locale: OrderPdfLocale): string {
  switch (locale) {
    case 'uk':
      return 'uk-UA'
    case 'sk':
      return 'sk-SK'
    case 'hu':
      return 'hu-HU'
    case 'de':
      return 'de-DE'
    case 'cs':
      return 'cs-CZ'
    default:
      return 'en-GB'
  }
}
