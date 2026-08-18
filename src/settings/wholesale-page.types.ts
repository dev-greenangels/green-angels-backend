import type { MarketRegion } from './market.types'

export type WholesalePageSettings = {
  title: string
  intro: string
  paragraphs: string[]
  seoTitle: string
  seoDescription: string
  formTitle: string
  formIntro: string
}

export const DEFAULT_WHOLESALE_PAGE_UA: WholesalePageSettings = {
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

export const DEFAULT_WHOLESALE_PAGE_SK: WholesalePageSettings = {
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

export function defaultWholesalePageSettings(region: MarketRegion): WholesalePageSettings {
  return region === 'sk' ? { ...DEFAULT_WHOLESALE_PAGE_SK } : { ...DEFAULT_WHOLESALE_PAGE_UA }
}
