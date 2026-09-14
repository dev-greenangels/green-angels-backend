import type { MarketRegion } from './market.types'
import { SUPPORTED_LOCALES, type AppLocale } from './localization.types'
import { sanitizeCmsImageUrl } from './cms-image-url'

export const ABOUT_SCHEMA_VERSION = 2 as const

export type AboutStatItem = {
  value: string
  label: string
  description: string
}

export type AboutProductionCard = {
  title: string
  description: string
  imageUrl: string
  imageAlt: string
}

/** @deprecated Use AboutProductionCard */
export type AboutProductLine = AboutProductionCard

export type AboutPageCmsCopy = {
  schemaVersion: typeof ABOUT_SCHEMA_VERSION
  seo: { title: string; description: string }
  hero: { enabled: boolean; title: string }
  intro: {
    enabled: boolean
    body: string
    imageUrl: string
    imageAlt: string
    imageStyle: 'circle' | 'rounded'
  }
  stats: {
    enabled: boolean
    title: string
    subtitle: string
    items: AboutStatItem[]
    theses: string[]
  }
  whyUs: {
    enabled: boolean
    title: string
    body: string
    benefits: string[]
  }
  production: {
    enabled: boolean
    title: string
    cards: AboutProductionCard[]
  }
  markets: {
    enabled: boolean
    title: string
    body: string
  }
  delivery: {
    enabled: boolean
    title: string
    body: string
    cities: string[]
    imageUrl: string
    imageAlt: string
    ctaLabel: string
  }
  video: {
    enabled: boolean
    title: string
    subtitle: string
    embedUrl: string
  }
  cta: {
    enabled: boolean
    primaryLabel: string
    secondaryLabel: string
  }
}

export type AboutPageSettings = {
  schemaVersion: typeof ABOUT_SCHEMA_VERSION
  /**
   * SK/EU only. When equal to EU_APPROVED_ABOUT_CONTENT_VERSION, bootstrap is a no-op
   * so Backoffice edits survive redeploys.
   */
  euApprovedContentVersion?: number
  byLocale: Partial<Record<AppLocale, AboutPageCmsCopy>>
}

export function emptyAboutCms(region: MarketRegion = 'ua'): AboutPageCmsCopy {
  const isSk = region === 'sk'
  return {
    schemaVersion: ABOUT_SCHEMA_VERSION,
    seo: { title: '', description: '' },
    hero: { enabled: true, title: '' },
    intro: {
      enabled: true,
      body: '',
      imageUrl: '',
      imageAlt: '',
      imageStyle: 'rounded',
    },
    stats: {
      enabled: !isSk,
      title: '',
      subtitle: '',
      items: [],
      theses: [],
    },
    whyUs: { enabled: true, title: '', body: '', benefits: [] },
    production: { enabled: !isSk, title: '', cards: [] },
    markets: { enabled: isSk, title: '', body: '' },
    delivery: {
      enabled: true,
      title: '',
      body: '',
      cities: [],
      imageUrl: '',
      imageAlt: '',
      ctaLabel: '',
    },
    video: { enabled: !isSk, title: '', subtitle: '', embedUrl: '' },
    cta: { enabled: true, primaryLabel: '', secondaryLabel: '' },
  }
}

/** Empty shell; section toggles follow UA defaults (stats/production/video on). */
export const EMPTY_ABOUT_CMS: AboutPageCmsCopy = emptyAboutCms('ua')

export function cloneCms(copy: AboutPageCmsCopy): AboutPageCmsCopy {
  return {
    schemaVersion: ABOUT_SCHEMA_VERSION,
    seo: { ...copy.seo },
    hero: { ...copy.hero },
    intro: { ...copy.intro },
    stats: {
      ...copy.stats,
      items: copy.stats.items.map((row) => ({ ...row })),
      theses: [...copy.stats.theses],
    },
    whyUs: {
      ...copy.whyUs,
      benefits: [...copy.whyUs.benefits],
    },
    production: {
      ...copy.production,
      cards: copy.production.cards.map((row) => ({ ...row })),
    },
    markets: { ...copy.markets },
    delivery: {
      ...copy.delivery,
      cities: [...copy.delivery.cities],
    },
    video: { ...copy.video },
    cta: { ...copy.cta },
  }
}

const VIDEO = 'https://www.youtube.com/embed/0cLivRZ4xeM'

const CMS_UK: AboutPageCmsCopy = {
  schemaVersion: ABOUT_SCHEMA_VERSION,
  seo: {
    title: 'Про нас · Зелені Янголи',
    description:
      'Розсадник «Зелені Янголи» — виробник посадкового матеріалу з Західної України. Власне виробництво, доставка по Україні.',
  },
  hero: {
    enabled: true,
    title: 'Зелені Янголи™ — звідки взялися та хто вони такі?',
  },
  intro: {
    enabled: true,
    body: `<p>Зелені янголи — це рослини. Вони укривають нас від спеки, утримують воду, очищують повітря, заспокоюють та дарують красу. Вони оберігають наш дім, наше довкілля, наше майбутнє.</p>
<p>Засновник та власник розсадника «Зелені Янголи» Ярослав Недолуженко — біолог за фахом та фермер у душі. У 2000 році почав розвиватися в зеленому бізнесі як молодий ландшафтний дизайнер, а в 2006 році разом із дружиною Андріанною відкрили свій перший садовий центр. Ярослав завжди мріяв працювати на землі та вирощувати рослини. Його девіз — «Хотіти, ставити цілі, діяти!» — і завдяки цьому кредо за 5 років на занедбаній території виріс один із провідних розсадників Західної України.</p>
<p>Раніше компанія була відома під назвою «Ландшафт Центр Ужгород», а влітку 2016 року народилися назва та бренд «Зелені Янголи». У вересні 2016 року новостворений бренд «вистрілив» на «Садовому фестивалі» та виграв перше місце за кращий стенд. Того ж року була зареєстрована торгова марка «Зелені Янголи»™ та логотип «Крила».</p>`,
    imageUrl: '',
    imageAlt: 'Андріанна та Ярослав Недолуженко — засновники розсадника «Зелені Янголи»',
    imageStyle: 'rounded',
  },
  stats: {
    enabled: true,
    title: 'Розсадник у цифрах',
    subtitle: 'Масштаб виробництва та турбота про кожну рослину — у цифрах і фактах.',
    items: [
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
  },
  whyUs: {
    enabled: true,
    title: 'Чому ми?',
    body: `<p>Для багатьох сад — це зона комфорту, улюблене хобі та гордість, а робота в саду є найкращим відпочинком, методом оновлення та зняття стресу. Ми працюємо для того, щоб ви отримували від свого саду ще більше задоволення — пропонуємо якісні рослини, вигідну ціну, оперативну доставку та широкий асортимент. Створіть разом з нами живопліт мрії, сад у східному стилі, природній сад, альпійську гірку чи рокарій.</p>
<p>Немає власної ділянки? Створіть міні-сад на балконі, терасі чи даху, або разом із членами ОСББ подбайте про озеленення прибудинкової території. Довіртеся виробнику — підкажемо, що і де посадити, які рослини квітнуть весною, влітку чи восени, що обрати для сонця, тіні чи біля води, як зробити живу огорожу.</p>
<p>Для тих, хто працює в сфері зеленого бізнесу, ландшафтного дизайну та архітектури — пропонуємо вигідні умови співпраці. Постачаємо якісні рослини за найкращою ціною українського виробника, організуємо доставку та допоможемо сформувати асортимент. Розсадник «Зелені Янголи» — партнер вашого успіху та креативних ідей.</p>`,
    benefits: [
      'Якісні рослини від виробника за вигідною ціною',
      'Близько 500 видів — від базових до ексклюзивних',
      'Оперативна доставка по всій Україні',
      'Хвойні та листяні кущі, дерева для ландшафтного дизайну',
      'Живопліт, сад у східному стилі, альпійська гірка чи рокарій',
      'Вигідні умови для гурту, садових центрів і ландшафтників',
    ],
  },
  production: {
    enabled: true,
    title: 'Наша продукція',
    cards: [
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
  },
  markets: { enabled: false, title: '', body: '' },
  delivery: {
    enabled: true,
    title: 'Доставка рослин',
    body: `<p>Лише у 2018 році ми доставили близько <strong>5000 замовлень</strong> поштою та понад <strong>300 тонн</strong> рослин вантажними перевезеннями. Рослини від «Зелених Янголів» тепер ростуть по всій Україні.</p>
<p>Відповідально пакуємо рослини, працюємо з надійними перевізниками та доставляємо як роздрібні, так і гуртові замовлення — від невеликих партій на палетах до великих вантажних перевезень.</p>`,
    cities: [
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
    imageUrl: '',
    imageAlt: 'Доставка рослин по Україні',
    ctaLabel: 'Умови оплати та доставки',
  },
  video: {
    enabled: true,
    title: 'Коротко про розсадник «Зелені Янголи»',
    subtitle: 'Відео про наше виробництво, поля та команду',
    embedUrl: VIDEO,
  },
  cta: {
    enabled: true,
    primaryLabel: 'Перейти в каталог',
    secondaryLabel: 'Контакти та гурт',
  },
}

const CMS_EN_UA: AboutPageCmsCopy = {
  ...cloneCms(CMS_UK),
  seo: {
    title: 'About us · Green Angels',
    description:
      'Green Angels nursery — grower of planting material from Western Ukraine. Own production, delivery across Ukraine.',
  },
  hero: { enabled: true, title: 'Green Angels™ — who we are' },
  cta: {
    enabled: true,
    primaryLabel: 'Browse catalog',
    secondaryLabel: 'Contacts & wholesale',
  },
  delivery: {
    ...cloneCms(CMS_UK).delivery,
    ctaLabel: 'Payment & delivery terms',
  },
}

export function primaryAboutLocale(region: MarketRegion): AppLocale {
  return region === 'sk' ? 'sk' : 'uk'
}

export function defaultAboutCmsByLocale(
  region: MarketRegion,
): Partial<Record<AppLocale, AboutPageCmsCopy>> {
  if (region === 'sk') {
    // Lazy require avoids circular init with about-eu-approved.v1
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildApprovedEuAboutByLocale } = require('./about-eu-approved.v1') as typeof import('./about-eu-approved.v1')
    return buildApprovedEuAboutByLocale()
  }
  return {
    uk: cloneCms(CMS_UK),
    en: cloneCms(CMS_EN_UA),
  }
}

export function defaultAboutPageSettings(region: MarketRegion): AboutPageSettings {
  return {
    schemaVersion: ABOUT_SCHEMA_VERSION,
    byLocale: defaultAboutCmsByLocale(region),
  }
}

export function isBlankAboutCms(copy: AboutPageCmsCopy): boolean {
  return (
    !copy.seo.title.trim() &&
    !copy.hero.title.trim() &&
    !copy.intro.body.trim() &&
    copy.stats.items.length === 0 &&
    copy.production.cards.length === 0 &&
    !copy.markets.title.trim() &&
    !copy.markets.body.trim() &&
    !copy.whyUs.title.trim() &&
    !copy.whyUs.body.trim()
  )
}

export function sanitizeAboutCmsCopy(copy: AboutPageCmsCopy): AboutPageCmsCopy {
  const next = cloneCms(copy)
  next.intro.imageUrl = sanitizeCmsImageUrl(next.intro.imageUrl)
  next.delivery.imageUrl = sanitizeCmsImageUrl(next.delivery.imageUrl)
  next.production.cards = next.production.cards.map((card) => ({
    ...card,
    imageUrl: sanitizeCmsImageUrl(card.imageUrl),
  }))
  return next
}

/**
 * Same-locale only. No en/sk/primary fallback.
 * Returns null when this locale has no published non-blank copy (and no same-locale default).
 */
export function resolveAboutPageCopy(
  settings: Pick<AboutPageSettings, 'byLocale'>,
  locale: string,
  region: MarketRegion,
): AboutPageCmsCopy | null {
  const primary = primaryAboutLocale(region)
  const requested = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as AppLocale)
    : primary

  const stored = settings.byLocale[requested]
  if (stored && !isBlankAboutCms(stored)) {
    return sanitizeAboutCmsCopy(stored)
  }

  const defaults = defaultAboutCmsByLocale(region)
  const defaultCopy = defaults[requested]
  if (defaultCopy && !isBlankAboutCms(defaultCopy)) {
    return sanitizeAboutCmsCopy(defaultCopy)
  }

  return null
}
