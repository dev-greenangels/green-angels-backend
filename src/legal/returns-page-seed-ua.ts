import type { LegalSeedEntry } from './legal-seed.types'
import { RETURNS_WITHDRAWAL_FORMS_MARKER } from './returns-page-seed-common'

type ReturnsLocaleCopy = {
  locale: string
  title: string
  intro: string
  section1Title: string
  section1Body: string
  section4Title: string
  section4Body: string
  section5Title: string
  section5Intro: string
  section5ReturnNote: string
  section6Title: string
  section6Paragraph: string
  section8Title: string
  section8Body: string
  section9Title: string
  section9Body: string
  section9NavLinks: string
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function buildReturnsEntry(copy: ReturnsLocaleCopy): LegalSeedEntry {
  return {
    type: 'RETURNS',
    locale: copy.locale,
    title: copy.title,
    intro: copy.intro,
    sections: [
      { heading: copy.section1Title, body: [copy.section1Body] },
      { heading: RETURNS_WITHDRAWAL_FORMS_MARKER, body: [] },
      { heading: copy.section4Title, body: [copy.section4Body] },
      {
        heading: copy.section5Title,
        body: [copy.section5Intro, '{returnAddress}', copy.section5ReturnNote],
      },
      { heading: copy.section6Title, body: [copy.section6Paragraph] },
      { heading: copy.section8Title, body: splitParagraphs(copy.section8Body) },
      {
        heading: copy.section9Title,
        body: [`${copy.section9Body} {supportEmail}`, copy.section9NavLinks],
      },
    ],
  }
}

/** UA deploy: returns / withdrawal under Ukrainian consumer law. */
export const UA_RETURNS_PAGE_SEED: LegalSeedEntry[] = [
  buildReturnsEntry({
    locale: 'uk',
    title: 'Повернення товару та відмова від договору',
    intro:
      'Інформація про повернення товару, 14-денне право на відмову від дистанційного договору та порядок пред’явлення вимог щодо недоліків відповідно до Закону України «Про захист прав споживачів».',
    section1Title: 'Повернення товару та відмова від договору',
    section1Body:
      'Замовлення стосується конкретного товару. Договір — правовідносини між вами та продавцем. Відмова від договору — право споживача у 14-денний строк без пояснення причин (дистанційний договір). Повернення товару — фізичний крок після розгляду відмови. Рекламація стосується недоліків товару та має іншу правову природу.',
    section4Title: 'Що відбувається після подання заяви',
    section4Body:
      'Ми підтвердимо отримання заяви про відмову від договору e-mailом із референційним номером. Оплату за товар, включно з вартістю найдешевшого звичайного способу доставки, повернемо не пізніше ніж за 14 днів з дня отримання заяви тим самим способом оплати, який ви використали (якщо не домовимося інакше).',
    section5Title: 'Повернення товару та витрати на доставку',
    section5Intro: 'Надішліть або передайте товар за адресою:',
    section5ReturnNote:
      'Витрати на повернення товару належної якості, як правило, несе споживач, якщо інше не передбачено законом або договором.',
    section6Title: 'Пошкодження під час доставки та рекламація',
    section6Paragraph:
      'Якщо товар надійшов пошкодженим або неповним, це не відмова від договору без пояснення причин, а відповідальність за недоліки. Рекомендуємо перевірити посилку при отриманні та негайно повідомити про пошкодження. Для рекламації прочитайте наші [[terms|Умови використання]].',
    section8Title: 'Живі рослини та 14-денний строк',
    section8Body:
      'На живі рослини в горщиках поширюється право на відмову від договору протягом 14 днів, якщо товар не був у використанні та збережено товарний вигляд — з урахуванням особливостей живих рослин.\n\nПретензії щодо пошкодження при транспортуванні або невідповідності сорту приймаються протягом 24 годин з моменту отримання з наданням фото.',
    section9Title: 'Контакти',
    section9Body: 'Питання щодо відмови від договору або рекламації надсилайте на:',
    section9NavLinks:
      '[[terms|Умови використання]] [[privacy|Конфіденційність]] [[cookies|Cookie]] [[shipping|Доставка та оплата]] [[contacts|Контакти]]',
  }),
  buildReturnsEntry({
    locale: 'en',
    title: 'Returns & withdrawal',
    intro:
      'Information on returns, the 14-day right to withdraw from a distance contract, and complaints under the Law of Ukraine “On consumer protection”.',
    section1Title: 'Returns and withdrawal',
    section1Body:
      'An order concerns specific goods. Withdrawal is the consumer’s statutory right within 14 days without giving a reason for distance contracts. Returning goods is a physical step after withdrawal is assessed. A complaint concerns defects and has a different legal basis.',
    section4Title: 'What happens after you submit',
    section4Body:
      'We confirm receipt of your withdrawal notice by email with a reference number. We refund payment for the goods, including the cheapest usual delivery cost, no later than 14 days from receipt of the notice, using the same payment method (unless agreed otherwise).',
    section5Title: 'Returning goods and shipping costs',
    section5Intro: 'Send or hand over the goods to:',
    section5ReturnNote:
      'Direct return costs for goods of satisfactory quality are generally borne by the consumer unless the law or contract provides otherwise.',
    section6Title: 'Damage in transit and complaints',
    section6Paragraph:
      'If goods arrived damaged or incomplete, this is a defect claim, not withdrawal without reason. Report damage promptly with photos. For complaints, read our [[terms|Terms of use]].',
    section8Title: 'Live plants and the 14-day period',
    section8Body:
      'Live plants in containers are subject to withdrawal within 14 days if unused and in merchantable condition, with due regard to the nature of live plants.\n\nClaims for transport damage or variety mismatch should be sent within 24 hours of delivery with photographs.',
    section9Title: 'Contact',
    section9Body: 'For withdrawal or complaint questions, contact:',
    section9NavLinks:
      '[[terms|Terms]] [[privacy|Privacy]] [[cookies|Cookies]] [[shipping|Shipping & payment]] [[contacts|Contacts]]',
  }),
  buildReturnsEntry({
    locale: 'sk',
    title: 'Vrátenie tovaru a odstúpenie od zmluvy',
    intro:
      'Informácie o vrátení tovaru a 14-dňovom práve na odstúpenie od zmluvy uzavretej na diaľku podľa ukrajinského zákona o ochrane spotrebiteľa (preklad pre zákazníkov).',
    section1Title: 'Vrátenie a odstúpenie',
    section1Body:
      'Objednávka sa týka konkrétneho tovaru. Odstúpenie je zákonné právo spotrebiteľa do 14 dní pri zmluvách uzavretých na diaľku. Vrátenie tovaru nasleduje po posúdení odstúpenia. Reklamácia sa týka vád.',
    section4Title: 'Po podaní žiadosti',
    section4Body:
      'Potvrdíme prijatie oznámenia o odstúpení e-mailom s referenčným číslom. Platbu vrátime do 14 dní rovnakým spôsobom platby, ak sa nedohodneme inak.',
    section5Title: 'Vrátenie tovaru',
    section5Intro: 'Tovar zašlite alebo odovzdajte na adrese:',
    section5ReturnNote: 'Náklady na vrátenie tovaru primeranej kvality zvyčajne znáša spotrebiteľ.',
    section6Title: 'Poškodenie a reklamácia',
    section6Paragraph: 'Poškodenie pri doprave riešte ako reklamáciu — pozrite [[terms|Obchodné podmienky]].',
    section8Title: 'Živé rastliny',
    section8Body:
      'Na živé rastliny sa vzťahuje 14-dňové právo na odstúpenie pri zachovaní stavu tovaru. Reklamácie poškodenia do 24 hodín s fotkami.',
    section9Title: 'Kontakt',
    section9Body: 'Otázky posielajte na:',
    section9NavLinks:
      '[[terms|Podmienky]] [[privacy|Ochrana údajov]] [[cookies|Cookies]] [[shipping|Doprava]] [[contacts|Kontakty]]',
  }),
  buildReturnsEntry({
    locale: 'de',
    title: 'Rückgabe und Widerruf',
    intro:
      'Informationen zur Rückgabe und zum 14-tägigen Widerrufsrecht bei Fernabsatzverträgen nach ukrainischem Verbraucherschutzrecht.',
    section1Title: 'Rückgabe und Widerruf',
    section1Body:
      'Der Widerruf ist das gesetzliche Recht des Verbrauchers innerhalb von 14 Tagen bei Fernabsatzverträgen. Die Rücksendung folgt nach Prüfung. Reklamationen betreffen Mängel.',
    section4Title: 'Nach der Einreichung',
    section4Body:
      'Wir bestätigen den Eingang per E-Mail mit Referenznummer und erstatten spätestens innerhalb von 14 Tagen.',
    section5Title: 'Warenrücksendung',
    section5Intro: 'Senden Sie die Ware an:',
    section5ReturnNote: 'Rücksendekosten trägt in der Regel der Verbraucher.',
    section6Title: 'Transportschäden',
    section6Paragraph: 'Transportschäden sind Reklamationen — siehe [[terms|AGB]].',
    section8Title: 'Lebende Pflanzen',
    section8Body: '14-Tage-Widerruf bei lebenden Pflanzen unter Beachtung des Zustands. Schadensmeldung innerhalb von 24 Stunden mit Fotos.',
    section9Title: 'Kontakt',
    section9Body: 'Fragen an:',
    section9NavLinks:
      '[[terms|AGB]] [[privacy|Datenschutz]] [[cookies|Cookies]] [[shipping|Versand]] [[contacts|Kontakt]]',
  }),
  buildReturnsEntry({
    locale: 'hu',
    title: 'Visszaküldés és elállás',
    intro:
      'Tájékoztató a visszaküldésről és a 14 napos elállási jogról távközi szerződéseknél az ukrán fogyasztóvédelmi törvény szerint.',
    section1Title: 'Visszaküldés és elállás',
    section1Body:
      'Az elállás a fogyasztó 14 napos törvényes joga távközi szerződéseknél. A visszaküldés az elállás után következik. A reklamáció a hibákra vonatkozik.',
    section4Title: 'Bejelentés után',
    section4Body: 'E-mailben visszaigazoljuk a bejelentést és 14 napon belül visszatérítünk.',
    section5Title: 'Áru visszaküldése',
    section5Intro: 'Küldje az árut ide:',
    section5ReturnNote: 'A visszaküldés költségeit általában a fogyasztó viseli.',
    section6Title: 'Szállítási sérülés',
    section6Paragraph: 'Szállítási sérülés reklamáció — lásd [[terms|ÁSZF]].',
    section8Title: 'Élő növények',
    section8Body: '14 napos elállás élő növényeknél a megfelelő állapot fenntartásával. Sérülés bejelentése 24 órán belül fotókkal.',
    section9Title: 'Kapcsolat',
    section9Body: 'Kérdések:',
    section9NavLinks:
      '[[terms|ÁSZF]] [[privacy|Adatvédelem]] [[cookies|Cookie]] [[shipping|Szállítás]] [[contacts|Kapcsolat]]',
  }),
  buildReturnsEntry({
    locale: 'cs',
    title: 'Vrácení zboží a odstoupení',
    intro:
      'Informace o vrácení zboží a 14denním právu na odstoupení od smlouvy uzavřené na dálku podle ukrajinského zákona o ochraně spotřebitele.',
    section1Title: 'Vrácení a odstoupení',
    section1Body:
      'Odstoupení je zákonné právo spotřebitele do 14 dnů u smluv uzavřených na dálku. Vrácení zboží následuje po posouzení. Reklamace se týká vad.',
    section4Title: 'Po podání žádosti',
    section4Body: 'Potvrdíme přijetí e-mailem a vrátíme platbu do 14 dnů.',
    section5Title: 'Vrácení zboží',
    section5Intro: 'Zboží zašlete na adresu:',
    section5ReturnNote: 'Náklady na vrácení obvykle nese spotřebitel.',
    section6Title: 'Poškození při dopravě',
    section6Paragraph: 'Poškození při dopravě řešte jako reklamaci — viz [[terms|Obchodní podmínky]].',
    section8Title: 'Živé rostliny',
    section8Body: '14denní právo na odstoupení u živých rostlin při zachování stavu. Reklamace poškození do 24 hodin s fotografiemi.',
    section9Title: 'Kontakt',
    section9Body: 'Dotazy na:',
    section9NavLinks:
      '[[terms|Podmínky]] [[privacy|Ochrana údajů]] [[cookies|Cookies]] [[shipping|Doprava]] [[contacts|Kontakty]]',
  }),
]
