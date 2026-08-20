import type { MarketRegion } from './market.types'
import { SUPPORTED_LOCALES, type AppLocale } from './localization.types'

export type WholesalePageCmsCopy = {
  title: string
  intro: string
  paragraphs: string[]
  seoTitle: string
  seoDescription: string
  formTitle: string
  formIntro: string
}

export type WholesalePageSettings = {
  /** Public page + form intake; shared across locales */
  pageEnabled: boolean
  /** Email staff on new inquiry; shared */
  notifyEmailEnabled: boolean
  /** Optional override; null = store-contact heuristic */
  notifyEmail: string | null
  /** Landing CMS per storefront locale */
  byLocale: Partial<Record<AppLocale, WholesalePageCmsCopy>>
}

/** Safe for public GET /settings — no notify address / toggle. */
export type PublicWholesalePageSettings = {
  pageEnabled: boolean
  byLocale: Partial<Record<AppLocale, WholesalePageCmsCopy>>
}

/** Storefront-resolved flat copy for one URL locale */
export type ResolvedWholesalePageSettings = WholesalePageCmsCopy & {
  pageEnabled: boolean
}

export const EMPTY_WHOLESALE_CMS: WholesalePageCmsCopy = {
  title: '',
  intro: '',
  paragraphs: [],
  seoTitle: '',
  seoDescription: '',
  formTitle: '',
  formIntro: '',
}

const CMS_UK: WholesalePageCmsCopy = {
  title: 'Ласкаво просимо на сторінку розсадника «Зелені Янголи»™ для гуртових клієнтів',
  intro:
    'На цьому сайті ви не знайдете гуртові ціни, тому, якщо працюєте в сфері зеленого бізнесу, звертайтеся за пропозицією.',
  paragraphs: [
    'Ми пропонуємо вигідні умови та великий асортимент рослин для тих, хто вже має чи планує започаткувати «зелений» бізнес. Допоможемо підібрати асортимент і розмір для вашої найбільшої вигоди.',
    'Заповніть коротку форму, щоб одержати гуртовий прайс. Якщо ви тільки плануєте започаткувати зелений бізнес, або поки що у вас не садовий центр, а невеличка точка з продажу чи міні-розсадник — розкажіть нам про себе, і ми підготуємо для вас вигідну пропозицію.',
    '«Зелені Янголи»™ — один з найбільших, провідних розсадників в Україні. Сьогодні загальна площа розсадника складає близько 70 га, з них 5 га — рослини в контейнері та тепличне господарство.',
    'Ми вирощуємо саджанці листяних та хвойних рослин самі, від живця чи сіянця до крупноміру, тому знайдете у нас пропозицію на адаптовані саджанці в різних розмірах.',
    'У нас ви завжди зможете купити якісні саджанці за справедливою ціною. Доставляємо великі та маленькі замовлення в будь-яку точку України.',
  ],
  seoTitle: 'Гурт для садових центрів і розсадників',
  seoDescription:
    'Гуртова співпраця з розсадником «Зелені Янголи»: умови для садових центрів, магазинів рослин і розсадників. Залиште заявку, щоб отримати гуртовий прайс.',
  formTitle: 'Заявка на гуртову співпрацю',
  formIntro: 'Заповніть форму — ми підготуємо пропозицію під ваш бізнес.',
}

const CMS_EN: WholesalePageCmsCopy = {
  title: 'Wholesale cooperation with the Green Angels nursery',
  intro:
    'We do not publish wholesale prices on this site. If you run a garden centre, nursery, plant shop or similar green business, contact us — we will prepare an offer.',
  paragraphs: [
    'We offer favourable terms and a wide plant assortment for garden centres, nurseries, landscapers and other partners. We help choose the range and sizes that work for your business.',
    'Fill in a short form with basic company details. We will prepare a wholesale price list and cooperation terms. If you are only planning to open a shop or mini-nursery, tell us about yourself — we will suggest a suitable offer.',
    'Green Angels grows deciduous and coniferous plants in-house — from cuttings and seedlings to larger sizes.',
    'We deliver small and larger orders to partners. Quality, adapted stock on fair B2B terms.',
  ],
  seoTitle: 'Wholesale for garden centres and nurseries',
  seoDescription:
    'Wholesale cooperation with the Green Angels nursery for garden centres, plant shops and nurseries. Send a request to get a B2B offer.',
  formTitle: 'Wholesale cooperation request',
  formIntro: 'Fill in the form — we will prepare an offer for your business.',
}

const CMS_SK: WholesalePageCmsCopy = {
  title: 'Veľkoobchodná spolupráca so škôlkou Green Angels',
  intro:
    'Veľkoobchodné ceny na tejto stránke nezverejňujeme. Ak prevádzkujete záhradné centrum, škôlku, predajňu rastlín alebo podobný biznis v EÚ, ozvite sa nám — pripravíme ponuku.',
  paragraphs: [
    'Ponúkame výhodné podmienky a široký sortiment rastlín pre záhradné centrá, škôlky, krajinárov a ďalších partnerov v zelenom biznise. Pomôžeme vybrať sortiment a veľkosti, ktoré sa vám oplatia.',
    'Vyplňte krátky formulár so základnými údajmi o firme. Pripravíme veľkoobchodný cenník a podmienky spolupráce. Ak ešte len plánujete otvoriť predajňu alebo miniškôlku, napíšte nám o sebe — navrhneme vhodnú ponuku.',
    'Green Angels je škôlka s vlastnou produkciou listnatých a ihličnatých drevín — od odrezkov a semenáčikov až po väčšie výpestky v rôznych veľkostiach.',
    'Dodávame malé aj väčšie objednávky partnerom na Slovensku a v EÚ. Kvalitný, adaptovaný výpestok za férové B2B podmienky.',
  ],
  seoTitle: 'Veľkoobchod pre záhradné centrá a škôlky',
  seoDescription:
    'Veľkoobchodná spolupráca so škôlkou Green Angels pre záhradné centrá, predajne rastlín a škôlky v EÚ. Odošlite dopyt a získate B2B ponuku.',
  formTitle: 'Dopyt na veľkoobchodnú spoluprácu',
  formIntro:
    'Vyplňte formulár vrátane firemných údajov (IČO, IČ DPH). Ozveme sa s ponukou.',
}

const CMS_DE: WholesalePageCmsCopy = {
  title: 'Großhandelskooperation mit der Baumschule Green Angels',
  intro:
    'Großhandelspreise veröffentlichen wir auf dieser Seite nicht. Wenn Sie ein Gartencenter, eine Baumschule, einen Pflanzenhandel oder ein ähnliches Unternehmen in der EU betreiben, melden Sie sich — wir erstellen ein Angebot.',
  paragraphs: [
    'Wir bieten günstige Konditionen und ein breites Sortiment für Gartencenter, Baumschulen, Landschaftsgärtner und weitere Partner. Gemeinsam wählen wir Sortiment und Größen, die sich für Sie lohnen.',
    'Füllen Sie das kurze Formular mit Firmendaten aus. Wir bereiten eine Großhandelspreisliste und Konditionen vor. Wenn Sie erst planen, einen Laden oder eine Mini-Baumschule zu eröffnen, schreiben Sie uns — wir schlagen ein passendes Angebot vor.',
    'Green Angels produziert Laub- und Nadelgehölze selbst — von Stecklingen und Sämlingen bis zu größeren Qualitäten.',
    'Wir liefern kleine und größere Bestellungen an Partner in der EU. Qualitätsware zu fairen B2B-Konditionen.',
  ],
  seoTitle: 'Großhandel für Gartencenter und Baumschulen',
  seoDescription:
    'Großhandelskooperation mit der Baumschule Green Angels für Gartencenter, Pflanzenhandlungen und Baumschulen in der EU. Anfrage senden und B2B-Angebot erhalten.',
  formTitle: 'Anfrage zur Großhandelskooperation',
  formIntro: 'Formular ausfüllen inkl. Firmendaten (IČO, USt-IdNr.). Wir melden uns mit einem Angebot.',
}

const CMS_HU: WholesalePageCmsCopy = {
  title: 'Nagykereskedelmi együttműködés a Green Angels faiskolával',
  intro:
    'Nagykereskedelmi árakat ezen az oldalon nem teszünk közzé. Ha kertészeti árudát, faiskolát, növényboltot vagy hasonló zöld üzletet üzemeltet az EU-ban, írjon nekünk — ajánlatot készítünk.',
  paragraphs: [
    'Kedvező feltételeket és széles növényválasztékot kínálunk kertészeti árudáknak, faiskoláknak, tájépítőknek és más partnereknek. Segítünk olyan sortimentet és méreteket választani, amelyek megérik.',
    'Töltse ki a rövid űrlapot a cég alapadataival. Elkészítjük a nagykereskedelmi árlistát és a feltételeket. Ha még csak tervezi az üzlet vagy mini-faiskola nyitását, írjon magáról — megfelelő ajánlatot javasolunk.',
    'A Green Angels saját termesztésű lombos és tűlevelű növényeket kínál — dugványtól és magoncoktól a nagyobb méretekig.',
    'Kis és nagyobb rendeléseket szállítunk EU-s partnereknek. Minőségi, adaptált áru tisztességes B2B feltételekkel.',
  ],
  seoTitle: 'Nagykereskedelem kertészeteknek és faiskoláknak',
  seoDescription:
    'Nagykereskedelmi együttműködés a Green Angels faiskolával kertészeti árudák, növényboltok és faiskolák számára az EU-ban. Küldjön ajánlatkérést B2B feltételekért.',
  formTitle: 'Nagykereskedelmi együttműködési kérelem',
  formIntro: 'Töltse ki az űrlapot cégadatokkal (IČO, adószám). Ajánlattal jelentkezünk.',
}

const CMS_CS: WholesalePageCmsCopy = {
  title: 'Velkoobchodní spolupráce se školkou Green Angels',
  intro:
    'Velkoobchodní ceny na této stránce nezveřejňujeme. Pokud provozujete zahradní centrum, školku, prodejnu rostlin nebo podobný byznys v EU, ozvěte se — připravíme nabídku.',
  paragraphs: [
    'Nabízíme výhodné podmínky a široký sortiment rostlin pro zahradní centra, školky, krajináře a další partnery. Pomůžeme vybrat sortiment a velikosti, které se vám vyplatí.',
    'Vyplňte krátký formulář se základními údaji o firmě. Připravíme velkoobchodní ceník a podmínky spolupráce. Pokud teprve plánujete otevřít prodejnu nebo miniškolku, napište nám o sobě — navrhneme vhodnou nabídku.',
    'Green Angels je školka s vlastní produkcí listnatých a jehličnatých dřevin — od řízků a semenáčků až po větší výpěstky.',
    'Dodáváme malé i větší objednávky partnerům v EU. Kvalitní, adaptovaný výpěstek za férové B2B podmínky.',
  ],
  seoTitle: 'Velkoobchod pro zahradní centra a školky',
  seoDescription:
    'Velkoobchodní spolupráce se školkou Green Angels pro zahradní centra, prodejny rostlin a školky v EU. Odešlete poptávku a získáte B2B nabídku.',
  formTitle: 'Poptávka na velkoobchodní spolupráci',
  formIntro: 'Vyplňte formulář včetně firemních údajů (IČO, DIČ). Ozveme se s nabídkou.',
}

function cloneCms(copy: WholesalePageCmsCopy): WholesalePageCmsCopy {
  return { ...copy, paragraphs: [...copy.paragraphs] }
}

export function defaultWholesaleCmsByLocale(
  region: MarketRegion,
): Partial<Record<AppLocale, WholesalePageCmsCopy>> {
  if (region === 'sk') {
    return {
      sk: cloneCms(CMS_SK),
      en: cloneCms(CMS_EN),
      de: cloneCms(CMS_DE),
      hu: cloneCms(CMS_HU),
      cs: cloneCms(CMS_CS),
      uk: cloneCms(CMS_UK),
    }
  }
  return {
    uk: cloneCms(CMS_UK),
    en: cloneCms(CMS_EN),
  }
}

export function defaultWholesalePageSettings(region: MarketRegion): WholesalePageSettings {
  return {
    pageEnabled: true,
    notifyEmailEnabled: true,
    notifyEmail: null,
    byLocale: defaultWholesaleCmsByLocale(region),
  }
}

export function primaryWholesaleLocale(region: MarketRegion): AppLocale {
  return region === 'sk' ? 'sk' : 'uk'
}

export function isBlankWholesaleCms(copy: WholesalePageCmsCopy): boolean {
  return (
    !copy.title.trim() &&
    !copy.intro.trim() &&
    copy.paragraphs.length === 0 &&
    !copy.seoTitle.trim() &&
    !copy.seoDescription.trim()
  )
}

export function resolveWholesalePageCopy(
  settings: Pick<WholesalePageSettings, 'byLocale'>,
  locale: string,
  region: MarketRegion,
): WholesalePageCmsCopy {
  const defaults = defaultWholesalePageSettings(region)
  const primary = primaryWholesaleLocale(region)
  const requested = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as AppLocale)
    : primary
  const chain: AppLocale[] = [requested, 'en', primary, ...SUPPORTED_LOCALES]
  const seen = new Set<AppLocale>()
  for (const loc of chain) {
    if (seen.has(loc)) continue
    seen.add(loc)
    const copy = settings.byLocale[loc]
    if (copy && !isBlankWholesaleCms(copy)) return cloneCms(copy)
  }
  const defaultCopy = defaults.byLocale[requested] ?? defaults.byLocale[primary] ?? CMS_EN
  return cloneCms(defaultCopy)
}

export function resolveWholesalePageSettings(
  settings: Pick<WholesalePageSettings, 'byLocale' | 'pageEnabled'>,
  locale: string,
  region: MarketRegion,
): ResolvedWholesalePageSettings {
  return {
    ...resolveWholesalePageCopy(settings, locale, region),
    pageEnabled: settings.pageEnabled,
  }
}

export function toPublicWholesalePageSettings(
  settings: WholesalePageSettings,
): PublicWholesalePageSettings {
  return {
    pageEnabled: settings.pageEnabled,
    byLocale: Object.fromEntries(
      Object.entries(settings.byLocale).map(([locale, copy]) => [
        locale,
        copy ? cloneCms(copy) : undefined,
      ]),
    ) as Partial<Record<AppLocale, WholesalePageCmsCopy>>,
  }
}
