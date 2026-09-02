import type { LegalSeedEntry } from './legal-seed.types'

const ACT_108 = 'zákona č. 108/2024 Z. z. o ochrane spotrebiteľa'
const ACT_391 = 'zákona č. 391/2015 Z. z. o alternatívnom riešení spotrebiteľských sporov'

export const SK_CORE_LEGAL_SEED: LegalSeedEntry[] = [
  {
    type: 'TERMS',
    locale: 'sk',
    title: 'Obchodné podmienky',
    intro:
      'Tieto obchodné podmienky (VOP) upravujú kúpu tovaru v internetovom obchode {sellerName}. Odoslaním objednávky kupujúci potvrdzuje, že sa s podmienkami oboznámil a súhlasí s nimi.',
    sections: [
      {
        heading: '1. Predávajúci a kupujúci',
        body: [
          'Predávajúcim je {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, sídlo {legalAddress}.',
          'Kupujúcim je každá osoba, ktorá odošle objednávku. Spotrebiteľom je fyzická osoba, ktorá nenakupuje v rámci podnikania alebo povolania, v zmysle {ACT_108}.',
          'Zmluvné strany uznávajú elektronickú komunikáciu prostredníctvom e-shopu, e-mailu a telefónu.',
        ],
      },
      {
        heading: '2. Ceny',
        body: [
          'Ceny tovaru sú konečné vrátane DPH v sadzbe platnej v Slovenskej republike, ak nie je pri tovare uvedené inak.',
          'Predávajúci je viazaný cenou zobrazenou v okamihu odoslania objednávky.',
          'Ak je tovar označený ako zľavnený, zľava sa počíta z najnižšej ceny, za ktorú bol tovar ponúkaný v predchádzajúcich 30 dňoch, v súlade s pravidlami o uvádzaní zliav.',
          'V prípade zjavne chybnej ceny (technická chyba) predávajúci objednávku za chybnú cenu neuplatní, bezodkladne kupujúceho informuje a navrhne správnu cenu. Objednávka je záväzná až po výslovnom potvrdení upravených podmienok.',
        ],
      },
      {
        heading: '3. Objednávka a kúpna zmluva',
        body: [
          'Objednávku možno vytvoriť v e-shope bez registrácie. Registrácia nie je povinná.',
          'Objednávka vzniká dokončením procesu v nákupnom košíku. Odoslaním objednávky kupujúci súhlasí s cenou a je viazaný zaplatiť kúpnu cenu.',
          'Potvrdením objednávky predávajúcim (e-mailom) vzniká kúpna zmluva. Zmena alebo zrušenie je možná dohodou, ak zákon neustanovuje inak.',
          'Tlačidlo odoslania objednávky je označené tak, aby bolo zrejmé, že odoslanie zakladá povinnosť platby.',
        ],
      },
      {
        heading: '4. Platba a dodanie',
        body: [
          'Dostupné spôsoby platby a dopravy sú zobrazené v pokladni podľa aktuálnej ponuky. Podrobnosti sú na stránke [[shipping|Doprava a platba]].',
          'Dodacia lehota závisí od dostupnosti rastlín, sezóny a zvoleného dopravcu. Predávajúci informuje o predobjednávkach a termíne expedície v objednávke.',
          'Riziko poškodenia prechádza na kupujúceho prevzatím zásielky. Pri viditeľnom poškodení balíka odporúčame spísať zápis u dopravcu a bezodkladne nás kontaktovať s fotografiami.',
        ],
      },
      {
        heading: '5. Odstúpenie od zmluvy (spotrebiteľ)',
        body: [
          'Spotrebiteľ môže odstúpiť od zmluvy uzavretej na diaľku do 14 dní odo dňa prevzatia tovaru bez uvedenia dôvodu podľa {ACT_108}.',
          'Na živé rastliny a tovar podliehajúci rýchlemu zhoršeniu sa môžu vzťahovať výnimky podľa § 19 ods. 1 písm. e) {ACT_108}. Podrobnosti a postup sú na stránke [[returns|Vrátenie tovaru a odstúpenie od zmluvy]].',
          'Reklamácie poškodenia prepravou alebo odchýlky od objednaného sortimentu prijímame prednostne do 24 hodín od doručenia s fotodokumentáciou.',
          'Vzorový formulár na odstúpenie je na stránke Vrátenie tovaru. Tovar vráťte na adresu predávajúceho uvedenú v Kontakte, ak sa nedohodnete inak.',
        ],
      },
      {
        heading: '6. Rastlinné pasy a fytosanitárne povinnosti',
        body: [
          'Pri premiestňovaní rastlín v EÚ sa uplatňuje nariadenie (EÚ) 2016/2031 o ochranných opatreniach proti škodcom rastlín a vykonávacie predpisy vrátane nariadenia (EÚ) 2019/2072.',
          'Rastliny, pre ktoré sa vyžaduje rastlinný pas, sú označené v súlade s pasovou povinnosťou. Rastlinný pas umožňuje spätné vysledovanie pôvodu až k pestovateľovi.',
          'Internetový predaj rastlín podlieha registrácii profesionálneho prevádzkovateľa a povinnosti informovať verejnosť o zákazoch, obmedzeniach a fytosanitárnych pravidlách EÚ. Aktuálne informácie ÚKSÚP: https://www.uksup.sk/internetovy-predaj',
          'Zásielky rastlín z tretích krajín podliehajú osobitným zákazom a požiadavkám; tento e-shop predáva tovar v rámci režimu EÚ podľa ponuky v katalógu.',
        ],
      },
      {
        heading: '7. Reklamácie a záruka',
        body: [
          'Predávajúci zodpovedá za vady tovaru v rozsahu Občianskeho zákonníka a {ACT_108}.',
          'Záruka sa nevzťahuje na uhynutie alebo poškodenie rastliny po prevzatí v dôsledku nesprávnej starostlivosti, mrazu, preschnutia, premokrenia alebo mechanického poškodenia kupujúcim.',
          'Reklamáciu uplatnite písomne alebo e-mailom na {supportEmail} a priložte číslo objednávky a fotografie.',
        ],
      },
      {
        heading: '8. Ochrana údajov a mimosúdne riešenie sporov',
        body: [
          'Spracúvanie osobných údajov upravuje samostatný dokument [[privacy|Podmienky ochrany osobných údajov]].',
          'Vzťahy sa spravujú právom Slovenskej republiky. Spotrebiteľ má právo podať žiadosť o nápravu u predávajúceho a podať podnet Slovenskej obchodnej inšpekcii (SOI).',
          'Spotrebiteľ môže využiť alternatívne riešenie spotrebiteľských sporov (ARS) podľa {ACT_391}. Informácie o subjektoch ARS sú dostupné na www.soi.sk.',
          'Neoddeliteľnou súčasťou zmluvy sú tieto podmienky v znení zverejnenom v čase odoslania objednávky (číslo a dátum revízie sú uvedené na tejto stránke).',
        ],
      },
      {
        heading: '9. Orgány dozoru',
        body: [
          'Slovenská obchodná inšpekcia (SOI) — dohľad nad dodržiavaním predpisov o ochrane spotrebiteľa: https://www.soi.sk',
          'Inšpektorát SOI pre Nitriansky kraj — pre podnety spotrebiteľov v regióne predávajúceho.',
          'Ústredný kontrolný a skúšobný ústav poľnohospodársky v Bratislave (ÚKSÚP) — fytosanitárna kontrola a informácie o predaji rastlín: https://www.uksup.sk',
        ],
      },
      {
        heading: '10. Kontaktné údaje',
        body: [
          'Predávajúci: {sellerName}, sídlo {legalAddress}.',
          'E-mail: {supportEmail}. Telefón a ďalšie kontakty: [[contacts|Kontakty]].',
        ],
      },
    ],
  },
  {
    type: 'TERMS',
    locale: 'en',
    title: 'Terms and conditions',
    intro:
      'These terms govern purchases in the {sellerName} online shop. By placing an order you confirm that you have read and accept them.',
    sections: [
      {
        heading: '1. Seller and buyer',
        body: [
          'The seller is {sellerName}, company ID (IČO) {ico}, tax ID (DIČ) {dic}, VAT ID (IČ DPH) {icDph}, registered office {legalAddress}.',
          'A consumer is a natural person not buying in the course of business. Distance contracts with consumers follow Slovak Act No. 108/2024 Coll. on consumer protection.',
          'The parties accept electronic communication via the shop, e-mail and telephone.',
        ],
      },
      {
        heading: '2. Prices, order and delivery',
        body: [
          'Prices include VAT unless stated otherwise. The binding price is the one shown when the order is submitted.',
          'Discount labels follow the 30-day lowest-price rule where that rule applies.',
          'Submitting the order creates a payment obligation. A contract is formed when the seller confirms the order.',
          'Payment and delivery methods available at checkout apply. See [[shipping|Shipping & payment]].',
        ],
      },
      {
        heading: '3. Withdrawal, plants and plant passports',
        body: [
          'Consumers may withdraw from a distance contract within 14 days under Act 108/2024 Coll. Exceptions for perishable goods (including live plants) may apply under § 19(1)(e). See [[returns|Returns & withdrawal]].',
          'Claims for transport damage or wrong variety should be sent within 24 hours of delivery with photographs.',
          'Movement of plants in the EU is governed by Regulation (EU) 2016/2031. Public information: https://www.uksup.sk/internetovy-predaj',
        ],
      },
      {
        heading: '4. Complaints, privacy and supervision',
        body: [
          'Warranty does not cover plant death after delivery caused by incorrect care, frost, drought, overwatering or mechanical damage by the buyer.',
          'Personal data is processed under the [[privacy|Privacy policy]].',
          'Consumer supervision: Slovak Trade Inspection (SOI) at https://www.soi.sk. Phytosanitary authority: ÚKSÚP at https://www.uksup.sk',
        ],
      },
    ],
  },
  {
    type: 'PRIVACY',
    locale: 'sk',
    title: 'Podmienky ochrany osobných údajov',
    intro:
      'Tento dokument plní informačnú povinnosť podľa nariadenia (EÚ) 2016/679 (GDPR) a zákona č. 18/2018 Z. z. o ochrane osobných údajov.',
    sections: [
      {
        heading: '1. Nákup tovaru',
        body: [
          'Na vybavenie objednávky spracúvame meno a priezvisko, e-mail, telefón, doručovaciu a fakturačnú adresu a obsah objednávky.',
          'Právnym základom je čl. 6 ods. 1 písm. b) GDPR (plnenie zmluvy) a čl. 6 ods. 1 písm. c) GDPR (zákonné povinnosti, napr. účtovníctvo a DPH).',
          'Bez týchto údajov nie je možné objednávku uzavrieť a doručiť. Údaje uchovávame počas plnenia zmluvy a následne po dobu vyplývajúcu z účtovných a daňových predpisov (spravidla 10 rokov).',
        ],
      },
      {
        heading: '2. Registrácia zákazníka',
        body: [
          'Pri registrácii spracúvame identifikačné a kontaktné údaje a históriu objednávok viazanú na účet.',
          'Právnym základom je plnenie zmluvy o vedení účtu (čl. 6 ods. 1 písm. b) GDPR). Údaje trvajú, kým účet nezrušíte.',
        ],
      },
      {
        heading: '3. Oprávnené záujmy a zákonné povinnosti',
        body: [
          'Môžeme spracúvať údaje na uplatnenie právnych nárokov, ochranu pred podvodom a na kontroly orgánov verejnej moci (čl. 6 ods. 1 písm. f) a c) GDPR).',
          'Účtovné doklady uchovávame podľa zákona o účtovníctve, zákona o DPH a súvisiacich predpisov.',
        ],
      },
      {
        heading: '4. Príjemcovia osobných údajov',
        body: [
          'Doručovateľské služby a kuriéri (napr. Packeta, DPD, GLS, Slovenská pošta) — údaje nevyhnutné na doručenie (meno, adresa, telefón).',
          'Platobné brány — údaje o transakcii; údaje platobnej karty priamo nespracúvame my.',
          'Poskytovatelia IT infraštruktúry a webhostingu — prevádzka e-shopu a e-mailovej komunikácie na základe zmlúv o spracúvaní.',
          'Účtovní a právni poradcovia — v rozsahu zákonných povinností a ochrany právnych nárokov.',
          'Osobné údaje spracúvame v EÚ, ak nie je pri konkrétnej službe uvedené inak. Údaje nepredávame tretím stranám.',
        ],
      },
      {
        heading: '5. Marketing a cookies',
        body: [
          'Obchodné oznámenia e-mailom posielame len so súhlasom alebo v rozsahu, ktorý dovoľuje zákon o elektronických komunikáciách, s možnosťou kedykoľvek odhlásiť odber.',
          'Na webe používame nevyhnutné cookies bez samostatného súhlasu. Voliteľné analytické a marketingové technológie spúšťame len po vašom súhlase; podrobnosti a správa súhlasu sú v [[cookies|Politike cookies]].',
          'Na správu meracích a marketingových značiek používame Google Tag Manager. Samotný Tag Manager nie je reklama; ďalšie služby merania alebo reklamy (napr. Google Analytics 4 alebo Google Ads) spúšťame len ak sú zapnuté a len podľa vášho súhlasu. Momentálne nie sú aktívne Google Analytics 4 ani Google Ads.',
          'Technické údaje môžu zahŕňať informácie o zariadení/prehliadači, interakcie so stránkou a stav súhlasu. Prostredníctvom Tag Managera a dataLayer neposielame meno, e-mail, telefón ani adresu.',
          'Súhlas s analytickými alebo marketingovými technológiami môžete kedykoľvek zmeniť alebo odvolať na stránke cookies. Vašu voľbu zaznamenávame na účely súladu a auditu.',
        ],
      },
      {
        heading: '6. Vaše práva podľa GDPR',
        body: [
          'Máte právo na prístup, opravu, vymazanie, obmedzenie spracúvania, prenosnosť údajov a namietať proti spracúvaniu na základe oprávneného záujmu.',
          'Súhlas so spracúvaním na e-mailový marketing, analytické cookies alebo marketingové/reklamné technológie môžete kedykoľvek odvolať (odkaz v e-mailoch alebo na stránke cookies).',
          'E-mail pre uplatnenie práv (GDPR): {supportEmail}',
          'Sťažnosť môžete podať Úradu na ochranu osobných údajov SR: https://dataprotection.gov.sk/uoou/',
          'Práva si uplatníte e-mailom alebo poštou na kontakt prevádzkovateľa. Táto revízia je tá, ktorú ste videli v čase súhlasu alebo objednávky.',
        ],
      },
    ],
  },
  {
    type: 'PRIVACY',
    locale: 'en',
    title: 'Privacy policy',
    intro:
      'This notice explains how we process personal data under the GDPR and Slovak Act No. 18/2018 Coll.',
    sections: [
      {
        heading: '1. Orders and account',
        body: [
          'To fulfil an order we process name, e-mail, phone, delivery/billing address and order contents on the basis of contract (Art. 6(1)(b) GDPR) and legal duties such as accounting (Art. 6(1)(c)).',
          'Account data is processed to run the customer account. You may export or delete the account; legally required order records are retained.',
        ],
      },
      {
        heading: '2. Recipients, cookies and rights',
        body: [
          'Carriers, payment providers, IT/hosting processors and professional advisers receive only what is needed to deliver the service. We do not sell personal data.',
          'Necessary cookies keep the cart, session and your cookie choice working. Optional analytics technologies (currently including Vercel Analytics) and marketing/advertising technologies run only with your consent and can be changed on the Cookie policy page.',
          'We use Google Tag Manager to manage approved measurement and marketing tags. Tag Manager itself is not advertising. Google Analytics 4 and Google Ads are not currently active; if enabled later, they will follow your consent choices.',
          'Technical data may include device/browser information, page interactions and consent state. We do not send name, email, phone or address through Tag Manager / dataLayer.',
          'GDPR requests: {supportEmail}. You may complain to the supervisory authority (Slovakia: https://dataprotection.gov.sk/uoou/).',
        ],
      },
    ],
  },
  {
    type: 'COOKIES',
    locale: 'sk',
    title: 'Politika súborov cookie',
    intro:
      'Cookies sú malé textové súbory. Táto politika vysvetľuje, ktoré kategórie používame a ako spravovať súhlas podľa ePrivacy a zákona o elektronických komunikáciách.',
    sections: [
      {
        heading: 'Kategórie cookies',
        body: [
          'Nevyhnutné cookies: potrebné na základné fungovanie webu (napr. košík, prihlásenie/relácia, jazyk a uloženie vašej voľby súhlasu). Túto kategóriu nie je možné vypnúť v nastaveniach súhlasu.',
          'Analytické cookies/technológie: voliteľné. Pomáhajú nám pochopiť, ako návštevníci používajú web (momentálne vrátane Vercel Analytics). Spúšťajú sa len po súhlase s kategóriou Analytické. Google Analytics 4 momentálne nie je aktívny.',
          'Marketingové cookies/technológie: voliteľné. Môžu slúžiť na meranie reklamy, konverzií a súvisiace reklamné funkcie, keď sú zapnuté. Spúšťajú sa len po súhlase s kategóriou Marketingové. Google Ads a Google Ads konverzie momentálne nie sú implementované a aktívne nezbierajú údaje.',
          'Google Tag Manager používame ako nástroj na správu značiek (tag management). Samotný Tag Manager nie je reklamná služba; umožňuje spúšťať schválené meracie a marketingové značky podľa vášho súhlasu.',
        ],
      },
      {
        heading: 'Správa súhlasu',
        body: [
          'Pred vašou voľbou sú analytické aj marketingové technológie vypnuté; aktívne zostávajú len nevyhnutné cookies.',
          'Pri prvej návšteve môžete prijať všetko, ponechať len nevyhnutné, alebo samostatne zapnúť/vypnúť Analytické a Marketingové.',
          'Voľbu môžete kedykoľvek zmeniť na tejto stránke. Uložená voľba súhlasu (súbor ga-cookie-consent) platí približne 180 dní, kým ju nezmeníte. Zmeny súhlasu zaznamenávame na účely súladu a auditu.',
        ],
      },
      {
        heading: 'Práva dotknutej osoby',
        body: [
          'Máte právo na prístup k údajom súvisiacim s cookies, ich opravu, vymazanie a odvolanie súhlasu so spracúvaním analytických alebo marketingových technológií.',
          'Podrobnosti o spracúvaní osobných údajov sú v [[privacy|Podmienkach ochrany osobných údajov]].',
          'Sťažnosť môžete podať Úradu na ochranu osobných údajov SR: https://dataprotection.gov.sk/uoou/',
        ],
      },
      {
        heading: 'Kontakt pre odvolanie súhlasu',
        body: [
          'Súhlas s analytickými alebo marketingovými technológiami môžete kedykoľvek odvolať na tejto stránke alebo e-mailom na {supportEmail}.',
        ],
      },
    ],
  },
  {
    type: 'COOKIES',
    locale: 'en',
    title: 'Cookie policy',
    intro:
      'Cookies are small text files. This policy explains which categories we use and how you can manage consent under ePrivacy rules.',
    sections: [
      {
        heading: 'Cookie categories',
        body: [
          'Necessary cookies: required for core site functions (for example cart, sign-in/session, language and storing your cookie choice). This category cannot be switched off in the consent controls.',
          'Analytics cookies/technologies: optional. They help us understand how visitors use the site (currently including Vercel Analytics). They run only after Analytics consent. Google Analytics 4 is not currently active.',
          'Marketing cookies/technologies: optional. They may be used for advertising measurement, conversion measurement and related advertising features when enabled. They run only after Marketing consent. Google Ads and Google Ads conversions are not currently implemented and are not actively collecting data.',
          'We use Google Tag Manager as a tag-management tool. Tag Manager itself is not an advertising service; it helps load approved measurement and marketing tags according to your consent.',
        ],
      },
      {
        heading: 'Managing consent',
        body: [
          'Before you choose, Analytics and Marketing stay off; only Necessary cookies remain active.',
          'On your first visit you can accept all, keep Necessary only, or turn Analytics and Marketing on or off independently.',
          'You can change your choice at any time on this page. The stored consent preference cookie (ga-cookie-consent) lasts about 180 days unless you change it. We record consent choices for compliance and audit purposes.',
        ],
      },
      {
        heading: 'Your rights and contact',
        body: [
          'You may withdraw Analytics or Marketing consent at any time on this page. Details of personal-data processing are in the [[privacy|Privacy policy]].',
          'To exercise GDPR rights or ask questions, contact {supportEmail}.',
        ],
      },
    ],
  },
  {
    type: 'MARKETING_CONSENT',
    locale: 'sk',
    title: 'Súhlas s marketingovými správami',
    intro:
      'Chcem dostávať novinky, akcie a ponuky obchodu e-mailom. Súhlas môžem kedykoľvek odvolať odkazom v e-maile.',
    sections: [
      {
        heading: 'Čo súhlas zahŕňa',
        body: [
          'Marketingové e-maily o tovare, akciách a novinkách škôlky. Oddelené od e-mailov o vašich objednávkach.',
          'Súhlas môžete odvolať jedným kliknutím v každom marketingovom e-maile.',
        ],
      },
    ],
  },
  {
    type: 'MARKETING_CONSENT',
    locale: 'en',
    title: 'Marketing email consent',
    intro:
      'I want to receive shop news, offers and promotions by email. I can withdraw consent at any time via the link in each message.',
    sections: [
      {
        heading: 'What this covers',
        body: [
          'Marketing emails about products, promotions and nursery news. Separate from transactional order emails.',
          'You can withdraw consent with one click in every marketing email.',
        ],
      },
    ],
  },
]

// Replace template constants in body strings (seed is static JSON-like)
for (const entry of SK_CORE_LEGAL_SEED) {
  entry.intro = entry.intro.replaceAll('{ACT_108}', ACT_108).replaceAll('{ACT_391}', ACT_391)
  for (const section of entry.sections) {
    section.heading = section.heading
      .replaceAll('{ACT_108}', ACT_108)
      .replaceAll('{ACT_391}', ACT_391)
    section.body = section.body.map((p) =>
      p.replaceAll('{ACT_108}', ACT_108).replaceAll('{ACT_391}', ACT_391),
    )
  }
}
