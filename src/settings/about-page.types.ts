import type { MarketRegion } from './market.types'
import { SUPPORTED_LOCALES, type AppLocale } from './localization.types'

export type AboutStatItem = {
  value: string
  label: string
  description: string
}

export type AboutProductLine = {
  title: string
  description: string
  imageUrl: string
  imageAlt: string
}

export type AboutPageCmsCopy = {
  seoTitle: string
  seoDescription: string
  heroTitle: string
  /** HTML allowed (p, strong, em, br, ul, ol, li, a) */
  introHtml: string
  foundersImageUrl: string
  foundersImageAlt: string
  /** circle = smaller circular crop; rounded = wide photo */
  foundersImageStyle: 'circle' | 'rounded'
  statsTitle: string
  statsSubtitle: string
  stats: AboutStatItem[]
  theses: string[]
  whyUsTitle: string
  whyUsHtml: string
  whyUsPoints: string[]
  catalogCtaLabel: string
  contactsCtaLabel: string
  productLinesTitle: string
  productLines: AboutProductLine[]
  videoTitle: string
  videoSubtitle: string
  videoEmbedUrl: string
  deliveryTitle: string
  deliveryHtml: string
  deliveryCities: string[]
  deliveryImageUrl: string
  deliveryImageAlt: string
  deliveryCtaLabel: string
}

export type AboutPageSettings = {
  byLocale: Partial<Record<AppLocale, AboutPageCmsCopy>>
}

export const EMPTY_ABOUT_CMS: AboutPageCmsCopy = {
  seoTitle: '',
  seoDescription: '',
  heroTitle: '',
  introHtml: '',
  foundersImageUrl: '',
  foundersImageAlt: '',
  foundersImageStyle: 'rounded',
  statsTitle: '',
  statsSubtitle: '',
  stats: [],
  theses: [],
  whyUsTitle: '',
  whyUsHtml: '',
  whyUsPoints: [],
  catalogCtaLabel: '',
  contactsCtaLabel: '',
  productLinesTitle: '',
  productLines: [],
  videoTitle: '',
  videoSubtitle: '',
  videoEmbedUrl: '',
  deliveryTitle: '',
  deliveryHtml: '',
  deliveryCities: [],
  deliveryImageUrl: '',
  deliveryImageAlt: '',
  deliveryCtaLabel: '',
}

const VIDEO = 'https://www.youtube.com/embed/0cLivRZ4xeM'

const CMS_UK: AboutPageCmsCopy = {
  seoTitle: 'Про нас · Зелені Янголи',
  seoDescription:
    'Розсадник «Зелені Янголи» — виробник посадкового матеріалу з Західної України. Власне виробництво, доставка по Україні.',
  heroTitle: 'Зелені Янголи™ — звідки взялися та хто вони такі?',
  introHtml: `<p>Зелені янголи — це рослини. Вони укривають нас від спеки, утримують воду, очищують повітря, заспокоюють та дарують красу. Вони оберігають наш дім, наше довкілля, наше майбутнє.</p>
<p>Засновник та власник розсадника «Зелені Янголи» Ярослав Недолуженко — біолог за фахом та фермер у душі. У 2000 році почав розвиватися в зеленому бізнесі як молодий ландшафтний дизайнер, а в 2006 році разом із дружиною Андріанною відкрили свій перший садовий центр. Ярослав завжди мріяв працювати на землі та вирощувати рослини. Його девіз — «Хотіти, ставити цілі, діяти!» — і завдяки цьому кредо за 5 років на занедбаній території виріс один із провідних розсадників Західної України.</p>
<p>Раніше компанія була відома під назвою «Ландшафт Центр Ужгород», а влітку 2016 року народилися назва та бренд «Зелені Янголи». У вересні 2016 року новостворений бренд «вистрілив» на «Садовому фестивалі» та виграв перше місце за кращий стенд. Того ж року була зареєстрована торгова марка «Зелені Янголи»™ та логотип «Крила».</p>`,
  foundersImageUrl: '',
  foundersImageAlt: 'Андріанна та Ярослав Недолуженко — засновники розсадника «Зелені Янголи»',
  foundersImageStyle: 'rounded',
  statsTitle: 'Розсадник у цифрах',
  statsSubtitle: 'Масштаб виробництва та турбота про кожну рослину — у цифрах і фактах.',
  stats: [
    {
      value: '90 га',
      label: 'площа господарства',
      description: 'Станом на 2021 рік — один із провідних розсадників Західної України',
    },
    {
      value: '500 000',
      label: 'рослин на рік',
      description: 'Широкий асортимент і замовлення на виробництво саджанців',
    },
    {
      value: '500+',
      label: 'видів рослин',
      description: 'Хвойні, листяні, декоративні та ексклюзивні позиції',
    },
    {
      value: '24/7',
      label: 'догляд за рослинами',
      description: '365 днів на рік — ми передаємо їм власну душу',
    },
    {
      value: 'з 2013',
      label: 'інтернет-магазин',
      description: 'Доставка роздрібних і гуртових замовлень по всій Україні',
    },
    {
      value: 'повний цикл',
      label: 'виробництва',
      description: 'Від вкоріненого живця до крупноміру — усе під нашим контролем',
    },
  ],
  theses: [
    'Компанія постійно рухається вперед — покращує якість та збільшує обсяги виробництва',
    'Залишаємося сімейним розсадником з особистим контролем якості та увагою до кожного клієнта',
    'Зелені Янголи™ — рослини з душею',
  ],
  whyUsTitle: 'Чому ми?',
  whyUsHtml: `<p>Для багатьох сад — це зона комфорту, улюблене хобі та гордість, а робота в саду є найкращим відпочинком, методом оновлення та зняття стресу. Ми працюємо для того, щоб ви отримували від свого саду ще більше задоволення — пропонуємо якісні рослини, вигідну ціну, оперативну доставку та широкий асортимент. Створіть разом з нами живопліт мрії, сад у східному стилі, природній сад, альпійську гірку чи рокарій.</p>
<p>Немає власної ділянки? Створіть міні-сад на балконі, терасі чи даху, або разом із членами ОСББ подбайте про озеленення прибудинкової території. Довіртеся виробнику — підкажемо, що і де посадити, які рослини квітнуть весною, влітку чи восени, що обрати для сонця, тіні чи біля води, як зробити живу огорожу.</p>
<p>Для тих, хто працює в сфері зеленого бізнесу, ландшафтного дизайну та архітектури — пропонуємо вигідні умови співпраці. Постачаємо якісні рослини за найкращою ціною українського виробника, організуємо доставку та допоможемо сформувати асортимент. Розсадник «Зелені Янголи» — партнер вашого успіху та креативних ідей.</p>`,
  whyUsPoints: [
    'Якісні рослини від виробника за вигідною ціною',
    'Близько 500 видів — від базових до ексклюзивних',
    'Оперативна доставка по всій Україні',
    'Хвойні та листяні кущі, дерева для ландшафтного дизайну',
    'Живопліт, сад у східному стилі, альпійська гірка чи рокарій',
    'Вигідні умови для гурту, садових центрів і ландшафтників',
  ],
  catalogCtaLabel: 'Перейти в каталог',
  contactsCtaLabel: 'Контакти та гурт',
  productLinesTitle: 'Наша продукція',
  productLines: [
    {
      title: 'Вкорінені живці в мультикасеті',
      description:
        'Хвойні та листяні рослини в мультикасеті (мультипалета) або в перліті (голий корінь). Можна купити з наявності або замовити наперед. Європейська якість від українського виробника — без імпорту, логістики через кордон і карантинних сертифікатів.',
      imageUrl: '',
      imageAlt: 'Вкорінені живці в мультикасеті',
    },
    {
      title: 'Рослини в контейнері P9',
      description:
        'Молоді саджанці 1–2 років, адаптовані до українського клімату. Широкий вибір для альпійських гірок, декоративних трав і грунтопокривних. Компактне пакування в коробці чи на палеті — вигідна доставка для професіоналів і садівників.',
      imageUrl: '',
      imageAlt: 'Саджанці в горщику P9',
    },
    {
      title: 'Саджанці в контейнері C2–C35',
      description:
        'Рослини у горщику від 2 до 35 літрів із закритою кореневою системою — пересадка у будь-який час року. Популярний матеріал для садових центрів, живих огорож, групових посадок і міського озеленення.',
      imageUrl: '',
      imageAlt: 'Саджанці в контейнері C2–C35',
    },
    {
      title: 'Крупноміри та рослини з комом',
      description:
        'Туї, ялівці, сосни, ялинки від 1 метра; привиті та стрижені форми; листяні дерева з кореневим комом. Професійне викопування, ком за стандартами, упаковка в мішковину та сітку (ЮТА), відправлення по всій Україні.',
      imageUrl: '',
      imageAlt: 'Крупноміри та рослини з кореневим комом',
    },
  ],
  videoTitle: 'Коротко про розсадник «Зелені Янголи»',
  videoSubtitle: 'Відео про наше виробництво, поля та команду',
  videoEmbedUrl: VIDEO,
  deliveryTitle: 'Доставка рослин',
  deliveryHtml: `<p>Лише у 2018 році ми доставили близько <strong>5000 замовлень</strong> поштою та понад <strong>300 тонн</strong> рослин вантажними перевезеннями. Рослини від «Зелених Янголів» тепер ростуть по всій Україні.</p>
<p>Відповідально пакуємо рослини, працюємо з надійними перевізниками та доставляємо як роздрібні, так і гуртові замовлення — від невеликих партій на палетах до великих вантажних перевезень.</p>`,
  deliveryCities: [
    'Одеса',
    'Київ',
    'Дніпро',
    'Запоріжжя',
    'Харків',
    'Миколаїв',
    'Львів',
    'Чернівці',
    'та інші міста України',
  ],
  deliveryImageUrl: '',
  deliveryImageAlt: 'Доставка рослин по Україні',
  deliveryCtaLabel: 'Умови оплати та доставки',
}

/** SK/EU: no UA founding saga — nursery as EU plant supplier. */
const CMS_SK: AboutPageCmsCopy = {
  seoTitle: 'O nás · Green Angels',
  seoDescription:
    'Škôlka Green Angels — vlastná produkcia sadbového materiálu pre Slovensko a EÚ. Kvalita, sortiment a spoľahlivé dodávky.',
  heroTitle: 'Green Angels — škôlka rastlín pre Slovensko a EÚ',
  introHtml: `<p>Green Angels je škôlka s vlastnou produkciou listnatých a ihličnatých drevín. Pestujeme rastliny od odrezku a semenáčika až po väčšie veľkosti — s dôrazom na kvalitu koreňového systému, adaptáciu a spoľahlivé dodávky pre záhradkárov, krajinárov aj záhradné centrá.</p>
<p>Partneri na Slovensku a v EÚ oceňujú predvídateľnú kvalitu, široký sortiment a férovú spoluprácu. Rastliny sú pripravené na stredoeurópske podmienky a bežnú logistiku v rámci EÚ.</p>
<p>Značka Green Angels spája skúsenosti rodinného pestovania s moderným e‑shopom: transparentný katalóg, jasné veľkosti a podpora pri výbere sortimentu pre váš projekt alebo predajňu.</p>`,
  foundersImageUrl: '',
  foundersImageAlt: 'Tím škôlky Green Angels',
  foundersImageStyle: 'rounded',
  statsTitle: 'Škôlka v číslach',
  statsSubtitle: 'Rozsah produkcie a starostlivosť o každú rastlinu — v číslach a faktoch.',
  stats: [
    {
      value: '90 ha',
      label: 'plocha hospodárstva',
      description: 'Vlastná produkcia a kontajnery — stabilný zdroj sadbového materiálu',
    },
    {
      value: '500 000',
      label: 'rastlín ročne',
      description: 'Široký sortiment a výroba na zákazku pre partnerov',
    },
    {
      value: '500+',
      label: 'druhov rastlín',
      description: 'Ihličnany, listnáče, okrasné a výberové položky',
    },
    {
      value: '24/7',
      label: 'starostlivosť',
      description: 'Celoročná starostlivosť o rastliny v škôlke',
    },
    {
      value: 'EÚ',
      label: 'dodávky',
      description: 'Orientácia na Slovensko a partnerské dodávky v EÚ',
    },
    {
      value: 'full cycle',
      label: 'produkcie',
      description: 'Od zakoreneného odrezku po väčšie veľkosti — pod našou kontrolou',
    },
  ],
  theses: [
    'Neustále zlepšujeme kvalitu a rozširujeme produkciu pre partnerov v EÚ',
    'Zostávame škôlkou s osobným dohľadom nad kvalitou a podporou zákazníkov',
    'Green Angels — rastliny pestované s dôrazom na kvalitu a spoľahlivosť',
  ],
  whyUsTitle: 'Prečo Green Angels?',
  whyUsHtml: `<p>Záhrada je pre mnohých miestom oddychu a hrdosti. Ponúkame kvalitné rastliny, jasné veľkosti, férovú cenu a praktickú podporu pri výbere — od živých plotov po solitéry a kontajnerové výpestky.</p>
<p>Nemáte veľký pozemok? Poradíme sortiment aj do menších priestorov — terasy, predzáhradky či spoločné plochy.</p>
<p>Pre záhradné centrá, krajinárov a zelený biznis v EÚ pripravíme veľkoobchodné podmienky a pomôžeme zložiť sortiment podľa dopytu.</p>`,
  whyUsPoints: [
    'Vlastná produkcia — predvídateľná kvalita',
    'Široký sortiment ihličnanov a listnáčov',
    'Veľkosti vhodné pre maloobchod aj projekty',
    'Podpora pri výbere sortimentu',
    'Orientácia na Slovensko a EÚ logistiku',
    'Veľkoobchodná spolupráca pre partnerov',
  ],
  catalogCtaLabel: 'Prejsť do katalógu',
  contactsCtaLabel: 'Kontakt a veľkoobchod',
  productLinesTitle: 'Naša produkcia',
  productLines: [
    {
      title: 'Zakorenené odrezky v multicell',
      description:
        'Ihličnany a listnáče v multicell / multipalete alebo v perlite. Dostupné zo skladu alebo na objednávku — vhodné pre ďalšie dopestovanie.',
      imageUrl: '',
      imageAlt: 'Zakorenené odrezky v multicell',
    },
    {
      title: 'Rastliny v kontajneri P9',
      description:
        'Mladé sadenice 1–2 roky, praktické na ďalšie pestovanie a menšie výsadby. Kompaktné balenie výhodné pre dopravu.',
      imageUrl: '',
      imageAlt: 'Sadenice v kvetináči P9',
    },
    {
      title: 'Sadenice v kontajneri C2–C35',
      description:
        'Rastliny v kvetináči 2–35 l so zatvoreným koreňovým systémom — výsadba počas celej sezóny. Obľúbené pre záhradné centrá a krajinárske projekty.',
      imageUrl: '',
      imageAlt: 'Sadenice v kontajneri C2–C35',
    },
    {
      title: 'Väčšie výpestky a rastliny s balom',
      description:
        'Tuje, borievky, borovice, smreky od 1 m; tvarované formy; listnaté stromy s koreňovým balom. Profesionálne balenie a príprava na prepravu.',
      imageUrl: '',
      imageAlt: 'Väčšie výpestky a rastliny s koreňovým balom',
    },
  ],
  videoTitle: '',
  videoSubtitle: '',
  videoEmbedUrl: '',
  deliveryTitle: 'Dodávka rastlín',
  deliveryHtml: `<p>Pripravujeme rastliny na spoľahlivú prepravu — starostlivé balenie a spolupráca s overenými dopravcami. Dodávame maloobchodné aj väčšie partnerské objednávky.</p>
<p>Pre Slovensko a EÚ nastavujeme logistiku podľa typu tovaru (kontajnery, väčšie výpestky) a dohody s partnerom.</p>`,
  deliveryCities: [
    'Bratislava',
    'Košice',
    'Žilina',
    'Nitra',
    'Banská Bystrica',
    'Trnava',
    'Prešov',
    'a ďalšie mestá SR / EÚ',
  ],
  deliveryImageUrl: '',
  deliveryImageAlt: 'Dodávka rastlín',
  deliveryCtaLabel: 'Podmienky platby a dopravy',
}

const CMS_EN_UA: AboutPageCmsCopy = {
  ...CMS_UK,
  seoTitle: 'About us · Green Angels',
  seoDescription:
    'Green Angels nursery — grower of planting material from Western Ukraine. Own production, delivery across Ukraine.',
  heroTitle: 'Green Angels™ — who we are',
  catalogCtaLabel: 'Browse catalog',
  contactsCtaLabel: 'Contacts & wholesale',
  deliveryCtaLabel: 'Payment & delivery terms',
}

const CMS_EN_SK: AboutPageCmsCopy = {
  ...CMS_SK,
  seoTitle: 'About us · Green Angels',
  seoDescription:
    'Green Angels nursery — own production of planting material for Slovakia and the EU. Quality assortment and reliable supply.',
  heroTitle: 'Green Angels — nursery plants for Slovakia & the EU',
  introHtml: `<p>Green Angels is a nursery with in-house production of deciduous and coniferous plants — from cuttings and seedlings to larger sizes. We focus on root quality, adaptation and reliable supply for gardeners, landscapers and garden centres.</p>
<p>Partners in Slovakia and the EU value predictable quality, a wide range and fair cooperation. Plants are prepared for Central European conditions and typical EU logistics.</p>
<p>The Green Angels brand combines hands-on growing experience with a modern webshop: a clear catalogue, transparent sizes and support when choosing stock for your project or store.</p>`,
  foundersImageAlt: 'Green Angels nursery team',
  statsTitle: 'Nursery in numbers',
  statsSubtitle: 'Production scale and care for every plant — in numbers and facts.',
  stats: [
    {
      value: '90 ha',
      label: 'nursery area',
      description: 'Own production and containers — a stable source of planting material',
    },
    {
      value: '500 000',
      label: 'plants per year',
      description: 'Wide assortment and made-to-order growing for partners',
    },
    {
      value: '500+',
      label: 'plant species',
      description: 'Conifers, deciduous, ornamental and select items',
    },
    {
      value: '24/7',
      label: 'plant care',
      description: 'Year-round care for plants in the nursery',
    },
    {
      value: 'EU',
      label: 'supply',
      description: 'Focus on Slovakia and partner deliveries across the EU',
    },
    {
      value: 'full cycle',
      label: 'production',
      description: 'From rooted cuttings to larger sizes — under our control',
    },
  ],
  theses: [
    'We continuously improve quality and expand production for EU partners',
    'We remain a nursery with personal quality oversight and customer support',
    'Green Angels — plants grown for quality and reliability',
  ],
  whyUsTitle: 'Why Green Angels?',
  whyUsHtml: `<p>A garden is a place of rest and pride for many. We offer quality plants, clear sizes, fair pricing and practical selection support — from hedges to specimens and container stock.</p>
<p>No large plot? We can advise assortment for smaller spaces — terraces, front yards or shared areas.</p>
<p>For garden centres, landscapers and green businesses in the EU we prepare wholesale terms and help build assortment to demand.</p>`,
  whyUsPoints: [
    'Own production — predictable quality',
    'Wide range of conifers and deciduous plants',
    'Sizes for retail and projects',
    'Support when choosing assortment',
    'Focus on Slovakia and EU logistics',
    'Wholesale cooperation for partners',
  ],
  catalogCtaLabel: 'Browse catalog',
  contactsCtaLabel: 'Contact & wholesale',
  productLinesTitle: 'Our production',
  productLines: [
    {
      title: 'Rooted cuttings in multicell',
      description:
        'Conifers and deciduous plants in multicell / multipallet or perlite. Available from stock or to order — suitable for further growing-on.',
      imageUrl: '',
      imageAlt: 'Rooted cuttings in multicell',
    },
    {
      title: 'Plants in P9 pots',
      description:
        'Young plants 1–2 years, practical for further growing and smaller plantings. Compact packing favourable for transport.',
      imageUrl: '',
      imageAlt: 'Plants in P9 pots',
    },
    {
      title: 'Container plants C2–C35',
      description:
        'Plants in 2–35 L pots with a closed root system — plant throughout the season. Popular with garden centres and landscape projects.',
      imageUrl: '',
      imageAlt: 'Container plants C2–C35',
    },
    {
      title: 'Larger stock and balled plants',
      description:
        'Thuja, junipers, pines, spruces from 1 m; shaped forms; deciduous trees with root balls. Professional packing and prep for transport.',
      imageUrl: '',
      imageAlt: 'Larger stock and balled plants',
    },
  ],
  deliveryTitle: 'Plant delivery',
  deliveryHtml: `<p>We prepare plants for reliable transport — careful packing and verified carriers. We deliver retail and larger partner orders.</p>
<p>For Slovakia and the EU we set logistics by goods type (containers, larger stock) and agreement with the partner.</p>`,
  deliveryCities: [
    'Bratislava',
    'Košice',
    'Žilina',
    'Nitra',
    'Banská Bystrica',
    'Trnava',
    'Prešov',
    'and other SK / EU cities',
  ],
  deliveryImageAlt: 'Plant delivery',
  deliveryCtaLabel: 'Payment & delivery terms',
}

function cloneCms(copy: AboutPageCmsCopy): AboutPageCmsCopy {
  return {
    ...copy,
    stats: copy.stats.map((row) => ({ ...row })),
    theses: [...copy.theses],
    whyUsPoints: [...copy.whyUsPoints],
    productLines: copy.productLines.map((row) => ({ ...row })),
    deliveryCities: [...copy.deliveryCities],
  }
}

export function primaryAboutLocale(region: MarketRegion): AppLocale {
  return region === 'sk' ? 'sk' : 'uk'
}

export function defaultAboutCmsByLocale(
  region: MarketRegion,
): Partial<Record<AppLocale, AboutPageCmsCopy>> {
  if (region === 'sk') {
    return {
      sk: cloneCms(CMS_SK),
      en: cloneCms(CMS_EN_SK),
      de: cloneCms(CMS_EN_SK),
      hu: cloneCms(CMS_EN_SK),
      cs: cloneCms(CMS_EN_SK),
    }
  }
  return {
    uk: cloneCms(CMS_UK),
    en: cloneCms(CMS_EN_UA),
  }
}

export function defaultAboutPageSettings(region: MarketRegion): AboutPageSettings {
  return { byLocale: defaultAboutCmsByLocale(region) }
}

export function isBlankAboutCms(copy: AboutPageCmsCopy): boolean {
  return (
    !copy.heroTitle.trim() &&
    !copy.introHtml.trim() &&
    !copy.seoTitle.trim() &&
    copy.stats.length === 0 &&
    copy.productLines.length === 0
  )
}

export function resolveAboutPageCopy(
  settings: Pick<AboutPageSettings, 'byLocale'>,
  locale: string,
  region: MarketRegion,
): AboutPageCmsCopy {
  const defaults = defaultAboutPageSettings(region)
  const primary = primaryAboutLocale(region)
  const requested = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as AppLocale)
    : primary
  const chain: AppLocale[] = [requested, 'en', primary, ...SUPPORTED_LOCALES]
  const seen = new Set<AppLocale>()
  for (const loc of chain) {
    if (seen.has(loc)) continue
    seen.add(loc)
    const copy = settings.byLocale[loc]
    if (copy && !isBlankAboutCms(copy)) return cloneCms(copy)
  }
  const defaultCopy =
    defaults.byLocale[requested] ?? defaults.byLocale[primary] ?? defaults.byLocale.en ?? EMPTY_ABOUT_CMS
  return cloneCms(defaultCopy)
}
