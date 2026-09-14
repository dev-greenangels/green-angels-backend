/**
 * Approved SK/EU About page content pack (version 1).
 * Used as code defaults + idempotent bootstrap for region === 'sk' only.
 * Does not contain UA production stats/photos.
 */
import {
  ABOUT_SCHEMA_VERSION,
  cloneCms,
  emptyAboutCms,
  type AboutPageCmsCopy,
} from './about-page.types'
import type { AppLocale } from './localization.types'

/** Bump only when intentionally replacing the approved EU pack via bootstrap. */
export const EU_APPROVED_ABOUT_CONTENT_VERSION = 1

function benefit(title: string, text: string): string {
  return `${title} — ${text}`
}

/** Second narrative block mapped into intro.body (no separate v2 field). */
function introWithSecondBlock(
  introHtml: string,
  secondTitle: string,
  secondBodyHtml: string,
): string {
  return `${introHtml.trim()}\n<p><strong>${secondTitle}</strong></p>\n${secondBodyHtml.trim()}`
}

function buildEuLocale(input: {
  seoTitle: string
  seoDescription: string
  heroTitle: string
  introHtml: string
  secondTitle: string
  secondBodyHtml: string
  whyUsTitle: string
  benefits: Array<{ title: string; text: string }>
  marketsTitle: string
  marketsBody: string
  deliveryTitle: string
  deliveryBody: string
  deliveryCtaLabel: string
  primaryLabel: string
  secondaryLabel: string
}): AboutPageCmsCopy {
  const base = emptyAboutCms('sk')
  return {
    ...base,
    schemaVersion: ABOUT_SCHEMA_VERSION,
    seo: {
      title: input.seoTitle,
      description: input.seoDescription,
    },
    hero: { enabled: true, title: input.heroTitle },
    intro: {
      enabled: true,
      body: introWithSecondBlock(input.introHtml, input.secondTitle, input.secondBodyHtml),
      imageUrl: '',
      imageAlt: '',
      imageStyle: 'rounded',
    },
    stats: {
      enabled: false,
      title: '',
      subtitle: '',
      items: [],
      theses: [],
    },
    whyUs: {
      enabled: true,
      title: input.whyUsTitle,
      body: '',
      benefits: input.benefits.map((row) => benefit(row.title, row.text)),
    },
    production: { enabled: false, title: '', cards: [] },
    markets: {
      enabled: true,
      title: input.marketsTitle,
      body: input.marketsBody,
    },
    delivery: {
      enabled: true,
      title: input.deliveryTitle,
      body: input.deliveryBody,
      cities: [],
      imageUrl: '',
      imageAlt: '',
      ctaLabel: input.deliveryCtaLabel,
    },
    video: { enabled: false, title: '', subtitle: '', embedUrl: '' },
    cta: {
      enabled: true,
      primaryLabel: input.primaryLabel,
      secondaryLabel: input.secondaryLabel,
    },
  }
}

const CMS_SK = buildEuLocale({
  seoTitle: 'O nás | Green Angels',
  seoDescription:
    'Škôlka okrasných rastlín a internetový obchod Green Angels — vlastná produkcia, jasné veľkosti a doručenie v strednej Európe.',
  heroTitle: 'O Green Angels',
  introHtml: `<p><strong>Green Angels je škôlka okrasných rastlín a internetový obchod prevádzkovaný spoločnosťou Green Angels International s.r.o. so sídlom na Slovensku.</strong></p>
<p>Venujeme sa pestovaniu a predaju okrasných rastlín pre súkromné záhrady, terasy, záhradné realizácie aj profesionálnych zákazníkov. Vlastná produkcia je dôležitou súčasťou Green Angels — rastliny pestujeme s dôrazom na ich kvalitu, zdravý vývoj a pripravenosť na ďalšie pestovanie a výsadbu.</p>
<p>V ponuke nájdete ihličnany, listnaté dreviny, okrasné kry, trvalky a ďalšie rastliny vhodné pre záhrady v podmienkach strednej Európy. Sortiment priebežne rozširujeme podľa sezóny a aktuálnej dostupnosti.</p>
<p>Green Angels spája pestovanie rastlín s moderným online predajom. Chceme, aby bol nákup rastlín cez internet prehľadný a zrozumiteľný — pri produktoch preto uvádzame dostupné veľkosti a varianty, ceny, aktuálnu dostupnosť a ďalšie dôležité parametre.</p>`,
  secondTitle: 'Rastliny sú živý produkt',
  secondBodyHtml: `<p>Každá rastlina je jedinečná. Jej vzhľad, hustota, vyfarbenie či aktuálna fáza rastu sa môžu prirodzene meniť podľa ročného obdobia a konkrétneho kusu.</p>
<p>Rastlinám venujeme pozornosť počas pestovania, skladovania aj prípravy objednávok. Pred odoslaním ich pripravujeme na prepravu s ohľadom na druh, veľkosť a spôsob doručenia.</p>
<p>Naším cieľom je ponúkať kvalitné rastliny spolu s jasnými a praktickými informáciami, ktoré zákazníkovi umožnia presne vedieť, akú veľkosť a variant rastliny si objednáva.</p>`,
  whyUsTitle: 'Prečo Green Angels?',
  benefits: [
    {
      title: 'Vlastná produkcia',
      text: 'Pestovaniu rastlín sa venujeme priamo v našej škôlke s dôrazom na ich kvalitu a zdravý vývoj.',
    },
    {
      title: 'Jasné veľkosti a varianty',
      text: 'Pri rastlinách zobrazujeme konkrétne dostupné veľkosti, kontajnery a ďalšie parametre, aby bolo zrejmé, čo si objednávate.',
    },
    {
      title: 'Aktuálna dostupnosť',
      text: 'Internetový obchod prepájame s aktuálnou ponukou, aby mal zákazník čo najpresnejšiu informáciu o dostupných rastlinách.',
    },
    {
      title: 'Široký sortiment okrasných rastlín',
      text: 'Ihličnany, listnaté dreviny, okrasné kry, trvalky a ďalšie rastliny pre rôzne typy záhrad a výsadieb.',
    },
    {
      title: 'Pre záhrady aj profesionálne realizácie',
      text: 'Sortiment je určený pre súkromné záhrady, terasy, záhradné realizácie aj profesionálnych zákazníkov.',
    },
    {
      title: 'Starostlivá príprava na prepravu',
      text: 'Rastliny pripravujeme a balíme s ohľadom na ich druh, veľkosť a zvolený spôsob dopravy.',
    },
  ],
  marketsTitle: 'Green Angels v Európe',
  marketsBody: `<p>Internetové obchody <strong>green-angels.sk</strong>, <strong>green-angels.hu</strong> a <strong>green-angels.at</strong> prevádzkuje spoločnosť <strong>Green Angels International s.r.o. so sídlom na Slovensku</strong>.</p>
<p>Jednotlivé internetové obchody sú prispôsobené príslušnému trhu — jazykom, menou a dostupnými možnosťami platby a doručenia. Prostredníctvom nich obsluhujeme zákazníkov na Slovensku, v Česku, Maďarsku, Rakúsku a Nemecku.</p>
<p>Bez ohľadu na použitú doménu zostáva prevádzkovateľom internetového obchodu a predávajúcim <strong>Green Angels International s.r.o.</strong></p>`,
  deliveryTitle: 'Dodávka rastlín',
  deliveryBody: `<p>Rastliny pripravujeme na prepravu podľa ich druhu, veľkosti a aktuálneho stavu. Menšie kontajnerované rastliny a väčšie exempláre môžu vyžadovať odlišný spôsob balenia a dopravy.</p>
<p>Dostupné spôsoby dopravy, ceny a možnosti platby sa zobrazujú podľa krajiny doručenia a konkrétnej objednávky.</p>
<p>Podrobné a aktuálne informácie nájdete na stránke <strong>Doprava a platba</strong>.</p>`,
  deliveryCtaLabel: 'Doprava a platba',
  primaryLabel: 'Prejsť do katalógu',
  secondaryLabel: 'Kontaktujte nás',
})

const CMS_EN = buildEuLocale({
  seoTitle: 'About us | Green Angels',
  seoDescription:
    'Ornamental plant nursery and online store Green Angels — own production, clear sizes and delivery across Central Europe.',
  heroTitle: 'About Green Angels',
  introHtml: `<p><strong>Green Angels is an ornamental plant nursery and online store operated by Green Angels International s.r.o., a company based in Slovakia.</strong></p>
<p>We grow and sell ornamental plants for private gardens, terraces, landscaping projects and professional customers. Our own nursery production is an important part of Green Angels — we grow plants with a focus on quality, healthy development and their readiness for further cultivation and planting.</p>
<p>Our range includes conifers, deciduous trees and shrubs, ornamental shrubs, perennials and other plants suitable for gardens in Central European conditions. We continuously expand our range according to the season and current availability.</p>
<p>Green Angels combines plant cultivation with modern online retail. We want buying plants online to be clear and straightforward, so our product pages show available sizes and variants, prices, current availability and other important parameters.</p>`,
  secondTitle: 'Plants are living products',
  secondBodyHtml: `<p>Every plant is unique. Its appearance, density, colour and current stage of growth can naturally vary depending on the season and the individual specimen.</p>
<p>We take care of our plants throughout cultivation, storage and order preparation. Before dispatch, plants are prepared for transport according to their type, size and delivery method.</p>
<p>Our goal is to offer quality plants together with clear and practical information, so customers can understand exactly which size and variant of plant they are ordering.</p>`,
  whyUsTitle: 'Why Green Angels?',
  benefits: [
    {
      title: 'Own nursery production',
      text: 'We grow plants in our own nursery with a focus on quality and healthy development.',
    },
    {
      title: 'Clear sizes and variants',
      text: 'We show the specific available sizes, containers and other relevant parameters so that customers know what they are ordering.',
    },
    {
      title: 'Current availability',
      text: 'Our online store reflects the current range so customers receive the most accurate possible information about plant availability.',
    },
    {
      title: 'Wide range of ornamental plants',
      text: 'Conifers, deciduous trees and shrubs, ornamental shrubs, perennials and other plants for different types of gardens and plantings.',
    },
    {
      title: 'For gardens and professional projects',
      text: 'Our range is suitable for private gardens, terraces, landscaping projects and professional customers.',
    },
    {
      title: 'Careful preparation for transport',
      text: 'Plants are prepared and packed according to their type, size and selected delivery method.',
    },
  ],
  marketsTitle: 'Green Angels in Europe',
  marketsBody: `<p>The online stores <strong>green-angels.sk</strong>, <strong>green-angels.hu</strong> and <strong>green-angels.at</strong> are operated by <strong>Green Angels International s.r.o., a company based in Slovakia</strong>.</p>
<p>Each online store is adapted to its respective market in terms of language, currency and available payment and delivery options. Through these stores, we serve customers in Slovakia, Czechia, Hungary, Austria and Germany.</p>
<p>Regardless of which domain is used, the operator of the online store and the seller remains <strong>Green Angels International s.r.o.</strong></p>`,
  deliveryTitle: 'Plant delivery',
  deliveryBody: `<p>We prepare plants for transport according to their type, size and current condition. Smaller container-grown plants and larger specimens may require different packing and transport methods.</p>
<p>Available delivery methods, prices and payment options are shown according to the delivery country and the individual order.</p>
<p>Detailed and up-to-date information is available on the <strong>Shipping and payment</strong> page.</p>`,
  deliveryCtaLabel: 'Shipping and payment',
  primaryLabel: 'Browse the catalogue',
  secondaryLabel: 'Contact us',
})

const CMS_CS = buildEuLocale({
  seoTitle: 'O nás | Green Angels',
  seoDescription:
    'Školka okrasných rostlin a internetový obchod Green Angels — vlastní produkce, jasné velikosti a doručení ve střední Evropě.',
  heroTitle: 'O Green Angels',
  introHtml: `<p><strong>Green Angels je školka okrasných rostlin a internetový obchod provozovaný společností Green Angels International s.r.o. se sídlem na Slovensku.</strong></p>
<p>Věnujeme se pěstování a prodeji okrasných rostlin pro soukromé zahrady, terasy, zahradní realizace i profesionální zákazníky. Vlastní produkce je důležitou součástí Green Angels — rostliny pěstujeme s důrazem na jejich kvalitu, zdravý vývoj a připravenost k dalšímu pěstování a výsadbě.</p>
<p>V nabídce najdete jehličnany, listnaté dřeviny, okrasné keře, trvalky a další rostliny vhodné pro zahrady ve středoevropských podmínkách. Sortiment průběžně rozšiřujeme podle sezóny a aktuální dostupnosti.</p>
<p>Green Angels spojuje pěstování rostlin s moderním online prodejem. Chceme, aby byl nákup rostlin přes internet přehledný a srozumitelný — u produktů proto uvádíme dostupné velikosti a varianty, ceny, aktuální dostupnost a další důležité parametry.</p>`,
  secondTitle: 'Rostliny jsou živý produkt',
  secondBodyHtml: `<p>Každá rostlina je jedinečná. Její vzhled, hustota, zbarvení i aktuální fáze růstu se mohou přirozeně měnit podle ročního období a konkrétního kusu.</p>
<p>Rostlinám věnujeme pozornost během pěstování, skladování i přípravy objednávek. Před odesláním je připravujeme k přepravě s ohledem na jejich druh, velikost a způsob doručení.</p>
<p>Naším cílem je nabízet kvalitní rostliny spolu s jasnými a praktickými informacemi, aby zákazník přesně věděl, jakou velikost a variantu rostliny objednává.</p>`,
  whyUsTitle: 'Proč Green Angels?',
  benefits: [
    {
      title: 'Vlastní produkce',
      text: 'Rostliny pěstujeme přímo v naší školce s důrazem na jejich kvalitu a zdravý vývoj.',
    },
    {
      title: 'Jasné velikosti a varianty',
      text: 'U rostlin zobrazujeme konkrétní dostupné velikosti, kontejnery a další parametry, aby bylo zřejmé, co si objednáváte.',
    },
    {
      title: 'Aktuální dostupnost',
      text: 'Internetový obchod propojujeme s aktuální nabídkou, aby měl zákazník co nejpřesnější informace o dostupnosti rostlin.',
    },
    {
      title: 'Široký sortiment okrasných rostlin',
      text: 'Jehličnany, listnaté dřeviny, okrasné keře, trvalky a další rostliny pro různé typy zahrad a výsadeb.',
    },
    {
      title: 'Pro zahrady i profesionální realizace',
      text: 'Sortiment je určen pro soukromé zahrady, terasy, zahradní realizace i profesionální zákazníky.',
    },
    {
      title: 'Pečlivá příprava k přepravě',
      text: 'Rostliny připravujeme a balíme s ohledem na jejich druh, velikost a zvolený způsob dopravy.',
    },
  ],
  marketsTitle: 'Green Angels v Evropě',
  marketsBody: `<p>Internetové obchody <strong>green-angels.sk</strong>, <strong>green-angels.hu</strong> a <strong>green-angels.at</strong> provozuje společnost <strong>Green Angels International s.r.o. se sídlem na Slovensku</strong>.</p>
<p>Jednotlivé internetové obchody jsou přizpůsobeny příslušnému trhu jazykem, měnou a dostupnými možnostmi platby a doručení. Jejich prostřednictvím obsluhujeme zákazníky na Slovensku, v Česku, Maďarsku, Rakousku a Německu.</p>
<p>Bez ohledu na použitou doménu zůstává provozovatelem internetového obchodu a prodávajícím <strong>Green Angels International s.r.o.</strong></p>`,
  deliveryTitle: 'Doručení rostlin',
  deliveryBody: `<p>Rostliny připravujeme k přepravě podle jejich druhu, velikosti a aktuálního stavu. Menší kontejnerované rostliny a větší exempláře mohou vyžadovat odlišný způsob balení a dopravy.</p>
<p>Dostupné způsoby dopravy, ceny a možnosti platby se zobrazují podle země doručení a konkrétní objednávky.</p>
<p>Podrobné a aktuální informace najdete na stránce <strong>Doprava a platba</strong>.</p>`,
  deliveryCtaLabel: 'Doprava a platba',
  primaryLabel: 'Přejít do katalogu',
  secondaryLabel: 'Kontaktujte nás',
})

const CMS_HU = buildEuLocale({
  seoTitle: 'Rólunk | Green Angels',
  seoDescription:
    'Dísznövény-iskola és webáruház — Green Angels saját termesztéssel, átlátható méretekkel és szállítással Közép-Európában.',
  heroTitle: 'A Green Angelsről',
  introHtml: `<p><strong>A Green Angels dísznövény-iskola és webáruház, amelyet a szlovákiai székhelyű Green Angels International s.r.o. üzemeltet.</strong></p>
<p>Dísznövények termesztésével és értékesítésével foglalkozunk magánkertek, teraszok, kertépítési projektek és professzionális vásárlók számára. A saját termesztés a Green Angels fontos része — növényeinket a minőségre, az egészséges fejlődésre, valamint a további nevelésre és kiültetésre való megfelelő felkészítésre összpontosítva termesztjük.</p>
<p>Kínálatunkban tűlevelűek, lombhullató fák és cserjék, díszcserjék, évelők és más, közép-európai körülmények között megfelelő kerti növények találhatók. Kínálatunkat folyamatosan bővítjük a szezonnak és az aktuális elérhetőségnek megfelelően.</p>
<p>A Green Angels a növénytermesztést modern online értékesítéssel kapcsolja össze. Fontos számunkra, hogy az online növényvásárlás átlátható és érthető legyen, ezért a termékeknél feltüntetjük az elérhető méreteket és változatokat, az árakat, az aktuális készletinformációkat és más fontos paramétereket.</p>`,
  secondTitle: 'A növény élő termék',
  secondBodyHtml: `<p>Minden növény egyedi. Megjelenése, sűrűsége, színe és aktuális fejlődési állapota természetes módon változhat az évszaktól és az adott példánytól függően.</p>
<p>A növényekre a termesztés, a tárolás és a rendelések előkészítése során is figyelmet fordítunk. Feladás előtt a növényeket fajuknak, méretüknek és a szállítás módjának megfelelően készítjük elő.</p>
<p>Célunk, hogy minőségi növényeket kínáljunk világos és praktikus információkkal együtt, hogy vásárlóink pontosan tudják, milyen méretű és változatú növényt rendelnek.</p>`,
  whyUsTitle: 'Miért a Green Angels?',
  benefits: [
    {
      title: 'Saját termesztés',
      text: 'Növényeinket saját faiskolánkban termesztjük, különös figyelmet fordítva a minőségre és az egészséges fejlődésre.',
    },
    {
      title: 'Egyértelmű méretek és változatok',
      text: 'A növényeknél feltüntetjük a konkrétan elérhető méreteket, konténereket és egyéb paramétereket, hogy egyértelmű legyen, mit rendel.',
    },
    {
      title: 'Aktuális elérhetőség',
      text: 'Webáruházunk az aktuális kínálatot tükrözi, hogy vásárlóink minél pontosabb információt kapjanak a növények elérhetőségéről.',
    },
    {
      title: 'Dísznövények széles választéka',
      text: 'Tűlevelűek, lombhullató fák és cserjék, díszcserjék, évelők és más növények különböző kertekhez és kiültetésekhez.',
    },
    {
      title: 'Kertekhez és professzionális projektekhez',
      text: 'Kínálatunk magánkertekhez, teraszokhoz, kertépítési projektekhez és professzionális vásárlók számára egyaránt alkalmas.',
    },
    {
      title: 'Gondos előkészítés a szállításra',
      text: 'A növényeket fajuknak, méretüknek és a választott szállítási módnak megfelelően készítjük elő és csomagoljuk.',
    },
  ],
  marketsTitle: 'Green Angels Európában',
  marketsBody: `<p>A <strong>green-angels.sk</strong>, <strong>green-angels.hu</strong> és <strong>green-angels.at</strong> webáruházakat a <strong>Green Angels International s.r.o., szlovákiai székhelyű társaság</strong> üzemelteti.</p>
<p>Az egyes webáruházak nyelve, pénzneme, valamint elérhető fizetési és szállítási lehetőségei az adott piachoz igazodnak. Webáruházainkon keresztül Szlovákiában, Csehországban, Magyarországon, Ausztriában és Németországban szolgálunk ki vásárlókat.</p>
<p>A használt domaintől függetlenül a webáruház üzemeltetője és az eladó a <strong>Green Angels International s.r.o.</strong></p>`,
  deliveryTitle: 'Növények szállítása',
  deliveryBody: `<p>A növényeket fajuk, méretük és aktuális állapotuk alapján készítjük elő a szállításra. A kisebb konténeres növények és a nagyobb példányok eltérő csomagolási és szállítási módot igényelhetnek.</p>
<p>Az elérhető szállítási módok, árak és fizetési lehetőségek a szállítási ország és az adott rendelés alapján jelennek meg.</p>
<p>Részletes és aktuális információk a <strong>Szállítás és fizetés</strong> oldalon találhatók.</p>`,
  deliveryCtaLabel: 'Szállítás és fizetés',
  primaryLabel: 'Tovább a katalógushoz',
  secondaryLabel: 'Kapcsolat',
})

const CMS_DE = buildEuLocale({
  seoTitle: 'Über uns | Green Angels',
  seoDescription:
    'Baumschule für Zierpflanzen und Online-Shop Green Angels — eigene Produktion, klare Größen und Versand in Mitteleuropa.',
  heroTitle: 'Über Green Angels',
  introHtml: `<p><strong>Green Angels ist eine Baumschule für Zierpflanzen und ein Online-Shop, betrieben von der Green Angels International s.r.o. mit Sitz in der Slowakei.</strong></p>
<p>Wir beschäftigen uns mit der Anzucht und dem Verkauf von Zierpflanzen für private Gärten, Terrassen, Garten- und Landschaftsbauprojekte sowie professionelle Kunden. Die eigene Pflanzenproduktion ist ein wichtiger Bestandteil von Green Angels — bei der Anzucht legen wir besonderen Wert auf Qualität, eine gesunde Entwicklung und die gute Vorbereitung der Pflanzen für die weitere Kultur und Pflanzung.</p>
<p>Unser Sortiment umfasst Nadelgehölze, Laubgehölze, Ziersträucher, Stauden und weitere Pflanzen, die für mitteleuropäische Gartenbedingungen geeignet sind. Das Sortiment wird entsprechend der Saison und der aktuellen Verfügbarkeit laufend erweitert.</p>
<p>Green Angels verbindet Pflanzenkultur mit modernem Online-Handel. Der Online-Kauf von Pflanzen soll übersichtlich und verständlich sein. Deshalb zeigen wir bei unseren Produkten verfügbare Größen und Varianten, Preise, die aktuelle Verfügbarkeit sowie weitere wichtige Parameter.</p>`,
  secondTitle: 'Pflanzen sind lebende Produkte',
  secondBodyHtml: `<p>Jede Pflanze ist einzigartig. Aussehen, Dichte, Färbung und Entwicklungsstadium können sich je nach Jahreszeit und individuellem Exemplar auf natürliche Weise unterscheiden.</p>
<p>Wir kümmern uns um die Pflanzen während der Kultur, Lagerung und Vorbereitung der Bestellungen. Vor dem Versand werden sie entsprechend ihrer Art, Größe und der gewählten Versandart für den Transport vorbereitet.</p>
<p>Unser Ziel ist es, hochwertige Pflanzen mit klaren und praktischen Informationen anzubieten, damit Kunden genau erkennen können, welche Größe und Variante sie bestellen.</p>`,
  whyUsTitle: 'Warum Green Angels?',
  benefits: [
    {
      title: 'Eigene Pflanzenproduktion',
      text: 'Wir kultivieren Pflanzen in unserer eigenen Baumschule und legen dabei besonderen Wert auf Qualität und eine gesunde Entwicklung.',
    },
    {
      title: 'Klare Größen und Varianten',
      text: 'Bei unseren Pflanzen zeigen wir konkret verfügbare Größen, Containergrößen und weitere Parameter, damit klar ist, was Sie bestellen.',
    },
    {
      title: 'Aktuelle Verfügbarkeit',
      text: 'Unser Online-Shop bildet das aktuelle Angebot ab, damit Kunden möglichst genaue Informationen über die Verfügbarkeit der Pflanzen erhalten.',
    },
    {
      title: 'Große Auswahl an Zierpflanzen',
      text: 'Nadelgehölze, Laubgehölze, Ziersträucher, Stauden und weitere Pflanzen für unterschiedliche Gärten und Pflanzungen.',
    },
    {
      title: 'Für Gärten und professionelle Projekte',
      text: 'Unser Sortiment eignet sich für private Gärten, Terrassen, Garten- und Landschaftsbauprojekte sowie professionelle Kunden.',
    },
    {
      title: 'Sorgfältige Versandvorbereitung',
      text: 'Die Pflanzen werden entsprechend ihrer Art, Größe und der gewählten Versandart vorbereitet und verpackt.',
    },
  ],
  marketsTitle: 'Green Angels in Europa',
  marketsBody: `<p>Die Online-Shops <strong>green-angels.sk</strong>, <strong>green-angels.hu</strong> und <strong>green-angels.at</strong> werden von der <strong>Green Angels International s.r.o. mit Sitz in der Slowakei</strong> betrieben.</p>
<p>Die einzelnen Online-Shops sind hinsichtlich Sprache, Währung sowie der verfügbaren Zahlungs- und Versandmöglichkeiten an den jeweiligen Markt angepasst. Über unsere Online-Shops bedienen wir Kunden in der Slowakei, in Tschechien, Ungarn, Österreich und Deutschland.</p>
<p>Unabhängig von der verwendeten Domain bleiben Betreiber des Online-Shops und Verkäufer die <strong>Green Angels International s.r.o.</strong></p>`,
  deliveryTitle: 'Pflanzenversand',
  deliveryBody: `<p>Wir bereiten die Pflanzen entsprechend ihrer Art, Größe und ihres aktuellen Zustands für den Transport vor. Kleinere Containerpflanzen und größere Exemplare können unterschiedliche Verpackungs- und Versandarten erfordern.</p>
<p>Die verfügbaren Versandarten, Preise und Zahlungsmöglichkeiten werden abhängig vom Lieferland und der jeweiligen Bestellung angezeigt.</p>
<p>Detaillierte und aktuelle Informationen finden Sie auf der Seite <strong>Versand und Zahlung</strong>.</p>`,
  deliveryCtaLabel: 'Versand und Zahlung',
  primaryLabel: 'Zum Katalog',
  secondaryLabel: 'Kontakt',
})

const CMS_UK_EU = buildEuLocale({
  seoTitle: 'Про нас | Green Angels',
  seoDescription:
    'Розсадник декоративних рослин і інтернет-магазин Green Angels — власне вирощування, зрозумілі розміри та доставка в Центральній Європі.',
  heroTitle: 'Про Green Angels',
  introHtml: `<p><strong>Green Angels — розсадник декоративних рослин та інтернет-магазин, яким керує компанія Green Angels International s.r.o. зі штаб-квартирою у Словаччині.</strong></p>
<p>Ми займаємося вирощуванням і продажем декоративних рослин для приватних садів, терас, проєктів озеленення та професійних клієнтів. Власне вирощування є важливою частиною Green Angels — ми вирощуємо рослини з особливою увагою до їхньої якості, здорового розвитку та готовності до подальшого дорощування і висаджування.</p>
<p>У нашому асортименті є хвойні та листяні декоративні рослини, кущі, багаторічники й інші рослини, придатні для садів в умовах Центральної Європи. Асортимент постійно розширюємо відповідно до сезону та актуальної наявності.</p>
<p>Green Angels поєднує вирощування рослин із сучасною онлайн-торгівлею. Ми прагнемо зробити купівлю рослин через інтернет зрозумілою та зручною, тому для товарів указуємо доступні розміри й варіанти, ціни, актуальну наявність та інші важливі параметри.</p>`,
  secondTitle: 'Рослини — живий товар',
  secondBodyHtml: `<p>Кожна рослина унікальна. Її зовнішній вигляд, густота, забарвлення та поточна стадія росту можуть природно змінюватися залежно від пори року й конкретного екземпляра.</p>
<p>Ми приділяємо увагу рослинам під час вирощування, зберігання та підготовки замовлень. Перед відправленням готуємо їх до транспортування з урахуванням виду, розміру та способу доставки.</p>
<p>Наша мета — пропонувати якісні рослини разом із чіткою та практичною інформацією, щоб покупець точно розумів, рослину якого розміру та варіанта він замовляє.</p>`,
  whyUsTitle: 'Чому Green Angels?',
  benefits: [
    {
      title: 'Власне вирощування',
      text: 'Ми вирощуємо рослини у власному розсаднику, приділяючи особливу увагу їхній якості та здоровому розвитку.',
    },
    {
      title: 'Зрозумілі розміри та варіанти',
      text: 'Для рослин указуємо конкретні доступні розміри, контейнери та інші параметри, щоб було зрозуміло, що саме ви замовляєте.',
    },
    {
      title: 'Актуальна наявність',
      text: 'Інтернет-магазин відображає актуальну пропозицію, щоб покупець отримував якомога точнішу інформацію про наявність рослин.',
    },
    {
      title: 'Широкий асортимент декоративних рослин',
      text: 'Хвойні, листяні декоративні рослини, кущі, багаторічники та інші рослини для різних типів садів і насаджень.',
    },
    {
      title: 'Для садів і професійних проєктів',
      text: 'Асортимент призначений для приватних садів, терас, проєктів озеленення та професійних клієнтів.',
    },
    {
      title: 'Ретельна підготовка до транспортування',
      text: 'Рослини готуємо та пакуємо з урахуванням їхнього виду, розміру та обраного способу доставки.',
    },
  ],
  marketsTitle: 'Green Angels у Європі',
  marketsBody: `<p>Інтернет-магазини <strong>green-angels.sk</strong>, <strong>green-angels.hu</strong> та <strong>green-angels.at</strong> працюють під управлінням компанії <strong>Green Angels International s.r.o. зі штаб-квартирою у Словаччині</strong>.</p>
<p>Кожен інтернет-магазин адаптований до відповідного ринку за мовою, валютою та доступними способами оплати й доставки. Через наші інтернет-магазини ми обслуговуємо покупців у Словаччині, Чехії, Угорщині, Австрії та Німеччині.</p>
<p>Незалежно від використовуваного домену оператором інтернет-магазину та продавцем залишається <strong>Green Angels International s.r.o.</strong></p>`,
  deliveryTitle: 'Доставка рослин',
  deliveryBody: `<p>Ми готуємо рослини до транспортування відповідно до їхнього виду, розміру та актуального стану. Для невеликих контейнерних рослин і великих екземплярів можуть використовуватися різні способи пакування та доставки.</p>
<p>Доступні способи доставки, ціни та варіанти оплати відображаються відповідно до країни доставки та конкретного замовлення.</p>
<p>Детальну й актуальну інформацію наведено на сторінці <strong>Доставка та оплата</strong>.</p>`,
  deliveryCtaLabel: 'Доставка та оплата',
  primaryLabel: 'Перейти до каталогу',
  secondaryLabel: 'Контакти',
})

export function buildApprovedEuAboutByLocale(): Record<AppLocale, AboutPageCmsCopy> {
  return {
    sk: cloneCms(CMS_SK),
    en: cloneCms(CMS_EN),
    cs: cloneCms(CMS_CS),
    hu: cloneCms(CMS_HU),
    de: cloneCms(CMS_DE),
    uk: cloneCms(CMS_UK_EU),
  }
}
