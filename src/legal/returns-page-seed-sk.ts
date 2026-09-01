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

/** Full /returns page legal copy — synced from storefront i18n (Phase B CMS unification). */
export const SK_RETURNS_PAGE_SEED: LegalSeedEntry[] = [
  buildReturnsEntry({
    locale: 'uk',
    title: 'Повернення товару та відмова від договору',
    intro:
      'Інформація про повернення товару, 14-денне право на відмову від договору та рекламаційний порядок відповідно до закону 108/2024 Z. z.',
    section1Title: 'Повернення товару та відмова від договору',
    section1Body:
      'Замовлення стосується конкретного товару. Договір — правовідносини між вами та продавцем. Відмова від договору — право споживача у 14-денний строк без пояснення причин. Повернення товару — фізичний крок після розгляду відмови. Рекламація стосується недоліків товару та має іншу правову природу.',
    section4Title: 'Що відбувається після подання заяви',
    section4Body:
      'Ми підтвердимо отримання заяви про відмову від договору e-mailом із референційним номером. Оплату за товар, включно з вартістю найдешевшого звичайного способу доставки, повернемо не пізніше ніж за 14 днів з дня отримання заяви тим самим способом оплати, який ви використали (якщо не домовимося інакше).',
    section5Title: 'Повернення товару та витрати на доставку',
    section5Intro: 'Надішліть або передайте товар за адресою:',
    section5ReturnNote:
      'Прямі витрати на повернення товару несе споживач відповідно до § 21 ч. 3 закону 108/2024 Z. z.',
    section6Title: 'Пошкодження під час доставки та рекламація',
    section6Paragraph:
      'Якщо товар надійшов пошкодженим або неповним, це не відмова від договору без пояснення причин, а відповідальність за недоліки. Рекомендуємо перевірити посилку при отриманні та негайно повідомити про пошкодження. Для рекламації прочитайте наші [[terms#reklamacia|Загальні умови (VOP)]].',
    section8Title: 'Живі рослини та 14-денний строк',
    section8Body:
      'На живі рослини в горщиках поширюється право на відмову від договору протягом 14 днів. Покупець зобов’язаний повернути рослину в початковому стані. Зменшення вартості через неправильне поводження, недостатній полив або невідповідні умови протягом цього строку буде враховано відповідно до § 21 ч. 4 закону 108/2024 Z. z.\n\nВиняток — неукорінені живці та зрізані квіти, щодо яких споживач не може відмовитися від договору через швидкопсувний товар (§ 19 ч. 1 п. d) закону 108/2024 Z. z.).',
    section9Title: 'Контакти',
    section9Body: 'Питання щодо відмови від договору або рекламації надсилайте на:',
    section9NavLinks:
      '[[terms|Умови використання]] [[privacy|Конфіденційність]] [[cookies|Cookie]] [[shipping|Доставка та оплата]] [[contacts|Контакти]]',
  }),
  buildReturnsEntry({
    locale: 'sk',
    title: 'Vrátenie tovaru a odstúpenie od zmluvy',
    intro:
      'Informácie o vrátení tovaru, odstúpení od zmluvy do 14 dní a reklamačnom konaní podľa zákona č. 108/2024 Z. z.',
    section1Title: 'Vrátenie tovaru a odstúpenie od zmluvy',
    section1Body:
      'Objednávka sa týka konkrétneho tovaru. Zmluva je právny vzťah medzi vami a predávajúcim. Odstúpenie od zmluvy je právo spotrebiteľa v zákonnej 14-dňovej lehote bez udania dôvodu. Vrátenie tovaru je fyzický krok po posúdení odstúpenia. Reklamácia sa týka vád tovaru a má inú právnu povahu.',
    section4Title: 'Čo sa deje po podaní žiadosti',
    section4Body:
      'Doručenie oznámenia o odstúpení od zmluvy vám potvrdíme e-mailom s referenčným číslom. Platbu za tovar vrátane nákladov na najlacnejší bežný spôsob doručenia vám vrátime najneskôr do 14 dní odo dňa doručenia oznámenia, a to rovnakým spôsobom, aký ste použili pri platbe (ak sa nedohodneme inak).',
    section5Title: 'Vrátenie tovaru a náklady na prepravu',
    section5Intro: 'Tovar zašlite alebo odovzdajte na adrese:',
    section5ReturnNote:
      'Priame náklady na vrátenie tovaru znáša spotrebiteľ v zmysle § 21 ods. 3 zákona č. 108/2024 Z. z.',
    section6Title: 'Poškodenie počas dopravy a reklamácia',
    section6Paragraph:
      'Ak vám tovar prišiel poškodený alebo nekompletný, nejde o odstúpenie od zmluvy bez udania dôvodu, ale o zodpovednosť za vady. Odporúčame zásielku skontrolovať pri prevzatí a poškodenie ihneď nahlásiť. Pre uplatnenie reklamácie si prečítajte naše [[terms#reklamacia|Všeobecné obchodné podmienky (VOP)]].',
    section8Title: 'Živé rastliny a 14-dňová lehota',
    section8Body:
      'Na živé rastliny v črepníkoch sa vzťahuje právo na odstúpenie od zmluvy do 14 dní. Zákazník je však povinný vrátiť rastlinu v pôvodnom stave. Zníženie hodnoty tovaru spôsobené nesprávnym zaobchádzaním, nedostatočným zalievaním alebo vystavením nevhodným podmienkam počas tejto lehoty bude započítané v zmysle § 21 ods. 4 zákona č. 108/2024 Z. z.\n\nVýnimkou sú nezakorenené odrezky a rezané kvety, pri ktorých spotrebiteľ nemôže odstúpiť od zmluvy z dôvodu tovaru podliehajúceho rýchlej skaze (§ 19 ods. 1 písm. d) zákona č. 108/2024 Z. z.).',
    section9Title: 'Kontakt',
    section9Body: 'Otázky týkajúce sa odstúpenia od zmluvy alebo reklamácií posielajte na:',
    section9NavLinks:
      '[[terms|Obchodné podmienky]] [[privacy|Ochrana osobných údajov]] [[cookies|Zásady používania cookies]] [[shipping|Doprava a platba]] [[contacts|Kontakty]]',
  }),
  buildReturnsEntry({
    locale: 'en',
    title: 'Returns & Withdrawal',
    intro:
      'Information on returns, the 14-day right of withdrawal, and the complaint procedure under Act 108/2024 Z. z.',
    section1Title: 'Returns and withdrawal from contract',
    section1Body:
      'An order concerns specific goods. The contract is the legal relationship between you and the seller. Withdrawal is the consumer’s statutory right within the 14-day period without giving a reason. Returning goods is a physical step after withdrawal is assessed. A complaint (warranty claim) concerns defects and has a different legal basis.',
    section4Title: 'What happens after you submit',
    section4Body:
      'We will confirm receipt of your withdrawal notice by email with a reference number. We will refund payment for the goods, including the cost of the cheapest usual delivery method, no later than 14 days from receipt of the notice, using the same payment method you used (unless we agree otherwise).',
    section5Title: 'Returning goods and shipping costs',
    section5Intro: 'Send or hand over the goods to:',
    section5ReturnNote:
      'Direct costs of returning the goods are borne by the consumer under § 21(3) of Act 108/2024 Z. z.',
    section6Title: 'Damage in transit and complaints',
    section6Paragraph:
      'If goods arrived damaged or incomplete, this is not withdrawal without giving a reason but liability for defects. We recommend inspecting the parcel on delivery and reporting damage immediately. To make a complaint, please read our [[terms#reklamacia|Terms and Conditions]].',
    section8Title: 'Live plants and the 14-day period',
    section8Body:
      'Live plants in containers are subject to the right of withdrawal within 14 days. The customer must return the plant in its original condition. Any reduction in value caused by improper handling, insufficient watering, or exposure to unsuitable conditions during this period will be deducted under § 21(4) of Act 108/2024 Z. z.\n\nExceptions are unrooted cuttings and cut flowers, where the consumer cannot withdraw due to perishable goods (§ 19(1)(d) of Act 108/2024 Z. z.).',
    section9Title: 'Contact',
    section9Body: 'For questions about withdrawal or complaints, contact:',
    section9NavLinks:
      '[[terms|Terms and conditions]] [[privacy|Privacy policy]] [[cookies|Cookie policy]] [[shipping|Shipping & payment]] [[contacts|Contacts]]',
  }),
  buildReturnsEntry({
    locale: 'de',
    title: 'Rückgabe und Widerruf',
    intro:
      'Informationen zur Warenrücksendung, zum 14-tägigen Widerrufsrecht und zum Reklamationsverfahren gemäß Gesetz 108/2024 Z. z.',
    section1Title: 'Rückgabe und Widerruf',
    section1Body:
      'Eine Bestellung betrifft bestimmte Waren. Der Vertrag ist das Rechtsverhältnis zwischen Ihnen und dem Verkäufer. Der Widerruf ist das gesetzliche Recht des Verbrauchers innerhalb der 14-tägigen Frist ohne Angabe von Gründen. Die Rücksendung von Waren ist ein physischer Schritt nach Prüfung des Widerrufs. Eine Reklamation (Gewährleistung) betrifft Mängel und hat eine andere Rechtsgrundlage.',
    section4Title: 'Was nach der Einreichung folgt',
    section4Body:
      'Den Eingang Ihrer Widerrufserklärung bestätigen wir per E-Mail mit einer Referenznummer. Die Zahlung für die Ware einschließlich der Kosten der günstigsten üblichen Lieferart erstatten wir spätestens innerhalb von 14 Tagen ab Eingang der Erklärung, mit derselben Zahlungsmethode, die Sie verwendet haben (sofern nichts anderes vereinbart wird).',
    section5Title: 'Warenrücksendung und Transportkosten',
    section5Intro: 'Senden oder übergeben Sie die Ware an folgende Adresse:',
    section5ReturnNote:
      'Die unmittelbaren Kosten der Rücksendung trägt der Verbraucher gemäß § 21 Abs. 3 des Gesetzes 108/2024 Z. z.',
    section6Title: 'Transportschäden und Reklamation',
    section6Paragraph:
      'Wenn die Ware beschädigt oder unvollständig ankam, handelt es sich nicht um einen Widerruf ohne Angabe von Gründen, sondern um Mängelhaftung. Wir empfehlen, die Sendung bei der Lieferung zu prüfen und Transportschäden unverzüglich zu melden. Für eine Reklamation lesen Sie bitte unsere [[terms#reklamacia|Allgemeinen Geschäftsbedingungen (AGB)]].',
    section8Title: 'Lebende Pflanzen und die 14-Tage-Frist',
    section8Body:
      'Für lebende Pflanzen in Containern gilt das Widerrufsrecht innerhalb von 14 Tagen. Der Kunde ist verpflichtet, die Pflanze im Originalzustand zurückzusenden. Eine Wertminderung durch unsachgemäße Behandlung, unzureichende Bewässerung oder ungeeignete Bedingungen während dieser Frist wird gemäß § 21 Abs. 4 des Gesetzes 108/2024 Z. z. angerechnet.\n\nAusgenommen sind unbewurzelte Stecklinge und Schnittblumen, bei denen der Verbraucher wegen verderblicher Ware nicht widerrufen kann (§ 19 Abs. 1 lit. d) Gesetz 108/2024 Z. z.).',
    section9Title: 'Kontakt',
    section9Body: 'Fragen zum Widerruf oder zur Reklamation richten Sie bitte an:',
    section9NavLinks:
      '[[terms|AGB]] [[privacy|Datenschutz]] [[cookies|Cookies]] [[shipping|Versand & Zahlung]] [[contacts|Kontakt]]',
  }),
  buildReturnsEntry({
    locale: 'hu',
    title: 'Visszaküldés és elállás a szerződéstől',
    intro:
      'Tájékoztató a termék visszaküldéséről, a 14 napos elállási jogról és a reklamációs eljárásról a 108/2024 Z. z. törvény szerint.',
    section1Title: 'Visszaküldés és elállás a szerződéstől',
    section1Body:
      'A rendelés konkrét árura vonatkozik. A szerződés az Ön és az eladó közötti jogviszony. Az elállás a fogyasztó törvényes joga a 14 napos határidőn belül indoklás nélkül. Az áru visszaküldése fizikai lépés az elállás elbírálása után. A reklamáció az áru hibáira vonatkozik, és más jogalapon nyugszik.',
    section4Title: 'Mi történik a bejelentés után',
    section4Body:
      'Az elállási nyilatkozat kézhezvételét e-mailben igazoljuk hivatkozási számmal. Az áru ellenértékét, beleértve a legolcsóbb szokásos szállítási költséget is, legkésőbb 14 napon belül visszatérítjük a nyilatkozat kézhezvételétől számítva, az Ön által használt fizetési módon (ha másként nem állapodunk meg).',
    section5Title: 'Áru visszaküldése és szállítási költségek',
    section5Intro: 'Az árut küldje vagy adja át a következő címen:',
    section5ReturnNote:
      'A visszaküldés közvetlen költségeit a fogyasztó viseli a 108/2024 Z. z. törvény § 21 (3) bekezdése értelmében.',
    section6Title: 'Szállítási sérülés és reklamáció',
    section6Paragraph:
      'Ha az áru sérülten vagy hiányosan érkezett, az nem indoklás nélküli elállás, hanem kárfelelősség. Javasoljuk a csomag átvételkor történő ellenőrzését és a sérülés azonnali bejelentését. Reklamáció érvényesítéséhez olvassa el [[terms#reklamacia|Általános Szerződési Feltételeinket (ÁSZF)]].',
    section8Title: 'Élő növények és a 14 napos határidő',
    section8Body:
      'A cserépben lévő élő növényekre 14 napon belül elállási jog vonatkozik. A vásárló köteles a növényt eredeti állapotban visszaküldeni. A helytelen kezelés, elégtelen öntözés vagy nem megfelelő körülmények miatti értékcsökkenést a 108/2024 Z. z. törvény § 21 (4) bekezdése szerint levonjuk.\n\nKivételt képeznek a gyökerezetlen dugványok és a vágott virágok, amelyeknél a fogyasztó nem állhat el a szerződéstől a gyorsan romlandó áru miatt (108/2024 Z. z. § 19 (1) d)).',
    section9Title: 'Kapcsolat',
    section9Body: 'Elállással vagy reklamációval kapcsolatos kérdéseket küldje a következő címre:',
    section9NavLinks:
      '[[terms|ÁSZF]] [[privacy|Adatvédelem]] [[cookies|Cookie]] [[shipping|Szállítás és fizetés]] [[contacts|Kapcsolat]]',
  }),
  buildReturnsEntry({
    locale: 'cs',
    title: 'Vrácení zboží a odstoupení od smlouvy',
    intro:
      'Informace o vrácení zboží, odstoupení od smlouvy do 14 dnů a reklamačním řízení podle zákona č. 108/2024 Z. z.',
    section1Title: 'Vrácení zboží a odstoupení od smlouvy',
    section1Body:
      'Objednávka se týká konkrétního zboží. Smlouva je právní vztah mezi vámi a prodávajícím. Odstoupení od smlouvy je právo spotřebitele ve zákonné 14denní lhůtě bez udání důvodu. Vrácení zboží je fyzický krok po posouzení odstoupení. Reklamace se týká vad zboží a má jinou právní povahu.',
    section4Title: 'Co se stane po podání žádosti',
    section4Body:
      'Doručení oznámení o odstoupení od smlouvy vám potvrdíme e-mailem s referenčním číslem. Platbu za zboží včetně nákladů na nejlevnější běžný způsob doručení vám vrátíme nejpozději do 14 dnů od doručení oznámení, a to stejným způsobem, jaký jste použili při platbě (pokud se nedohodneme jinak).',
    section5Title: 'Vrácení zboží a náklady na přepravu',
    section5Intro: 'Zboží zašlete nebo předejte na adrese:',
    section5ReturnNote:
      'Přímé náklady na vrácení zboží nese spotřebitel ve smyslu § 21 odst. 3 zákona č. 108/2024 Z. z.',
    section6Title: 'Poškození při dopravě a reklamace',
    section6Paragraph:
      'Pokud vám zboží přišlo poškozené nebo nekompletní, nejde o odstoupení od smlouvy bez udání důvodu, ale o odpovědnost za vady. Doporučujeme zásilku zkontrolovat při převzetí a poškození ihned nahlásit. Pro uplatnění reklamace si přečtěte naše [[terms#reklamacia|Všeobecné obchodní podmínky (VOP)]].',
    section8Title: 'Živé rostliny a 14denní lhůta',
    section8Body:
      'Na živé rostliny v květináčích se vztahuje právo na odstoupení od smlouvy do 14 dnů. Zákazník je však povinen vrátit rostlinu v původním stavu. Snížení hodnoty zboží způsobené nesprávným zacházením, nedostatečným zaléváním nebo vystavením nevhodným podmínkám během této lhůty bude započteno ve smyslu § 21 odst. 4 zákona č. 108/2024 Z. z.\n\nVýjimkou jsou nezakořeněné řízky a řezané květy, u nichž spotřebitel nemůže odstoupit od smlouvy z důvodu zboží podléhajícího rychlé zkáze (§ 19 odst. 1 písm. d) zákona č. 108/2024 Z. z.).',
    section9Title: 'Kontakt',
    section9Body: 'Dotazy týkající se odstoupení od smlouvy nebo reklamací posílejte na:',
    section9NavLinks:
      '[[terms|Obchodní podmínky]] [[privacy|Ochrana osobních údajů]] [[cookies|Cookies]] [[shipping|Doprava a platba]] [[contacts|Kontakty]]',
  }),
]
