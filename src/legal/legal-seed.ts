export type LegalSeedSection = {
  heading: string
  body: string[]
}

export type LegalSeedEntry = {
  type: 'TERMS' | 'PRIVACY' | 'COOKIES' | 'RETURNS' | 'MARKETING_CONSENT'
  locale: string
  title: string
  intro: string
  sections: LegalSeedSection[]
}

export const LEGAL_SEED: LegalSeedEntry[] = [
  {
    type: 'TERMS',
    locale: 'uk',
    title: 'Умови використання',
    intro: 'Ці Умови використання регулюють відносини між {sellerName} (далі — «Продавець», ЄДРПОУ/ІПН {ico}, адреса {legalAddress}) та покупцями товарів. Оформлюючи замовлення, ви підтверджуєте згоду з цими умовами.',
    sections: [
      {
        heading: '1. Загальні положення',
        body: [
          'Сайт є вітриною розсадника рослин. Продавець: {sellerName}, ЄДРПОУ/ІПН {ico}, адреса {legalAddress}. Актуальні контакти також на сторінці «Контакти».',
          'Оформлюючи замовлення на Сайті, ви підтверджуєте свою згоду з цими Умовами використання та зобов’язуєтесь їх дотримуватись.',
        ],
      },
      {
        heading: '2. Оформлення замовлення',
        body: [
          'Замовлення оформлюються через Сайт, по телефону або електронною поштою.',
          'Після оформлення замовлення на вказану електронну адресу надходить підтвердження з деталями замовлення.',
          'Продавець залишає за собою право відмовити у виконанні замовлення у випадку відсутності товару на складі або неможливості зв’язатися з покупцем.',
        ],
      },
      {
        heading: '3. Ціни та оплата',
        body: [
          'Усі ціни на Сайті вказані в гривнях та включають ПДВ, якщо інше прямо не зазначено.',
          'Продавець може змінювати ціни без попередження. Ціна замовлення фіксується на момент його оформлення.',
          'Доступні способи оплати відображаються на етапі оформлення замовлення.',
        ],
      },
      {
        heading: '4. Доставка',
        body: [
          'Доставка здійснюється способами, доступними в кошику (зокрема Нова Пошта або самовивіз — залежно від налаштувань магазину).',
          'Терміни доставки залежать від обраного способу та регіону.',
          'Вартість доставки розраховується відповідно до тарифів перевізника та залежить від ваги й габаритів замовлення.',
        ],
      },
      {
        heading: '5. Повернення та обмін',
        body: [
          'Покупець має право повернути або обміняти товар належної якості протягом 14 днів з моменту отримання, якщо товар не був у використанні та збережено його товарний вигляд — з урахуванням особливостей живих рослин.',
          'Для рослин повернення приймається насамперед у випадку пошкодження при транспортуванні або невідповідності сорту. Претензії приймаються протягом 24 годин з моменту отримання з наданням фото.',
          'Вартість зворотної доставки оплачується покупцем, крім випадків повернення товару неналежної якості.',
        ],
      },
      {
        heading: '6. Гарантії',
        body: [
          'Продавець гарантує якість посадкового матеріалу на момент продажу.',
          'Гарантія не поширюється на пошкодження рослин внаслідок неправильного догляду, несприятливих погодних умов або механічних пошкоджень після отримання.',
        ],
      },
      {
        heading: '7. Конфіденційність',
        body: [
          'Обробка персональних даних здійснюється згідно з Політикою конфіденційності та Законом України «Про захист персональних даних».',
          'Дані використовуються для виконання замовлення та зв’язку з вами; третім особам передаються лише в обсязі, необхідному для доставки, оплати чи обліку.',
        ],
      },
    ],
  },
  {
    type: 'TERMS',
    locale: 'sk',
    title: 'Obchodné podmienky',
    intro: 'Tieto obchodné podmienky upravujú kúpu tovaru v internetovom obchode {sellerName}. Odoslaním objednávky kupujúci potvrdzuje, že sa s podmienkami oboznámil a súhlasí s nimi. Predávajúci: {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, sídlo {legalAddress}.',
    sections: [
      {
        heading: '1. Predávajúci a kupujúci',
        body: [
          'Predávajúcim je {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, sídlo {legalAddress}. Tieto údaje sa berú z firemných nastavení e-shopu (back office).',
          'Kupujúcim je každá osoba, ktorá odošle objednávku. Spotrebiteľom je fyzická osoba, ktorá nenakupuje v rámci podnikania alebo povolania, v zmysle zákona č. 102/2014 Z. z. a zákona č. 250/2007 Z. z.',
          'Zmluvné strany uznávajú elektronickú komunikáciu prostredníctvom e-shopu, e-mailu a telefónu.',
        ],
      },
      {
        heading: '2. Ceny',
        body: [
          'Ceny tovaru sú konečné vrátane DPH v sadzbe platnej v Slovenskej republike, ak nie je pri tovare uvedené inak.',
          'Predávajúci je viazaný cenou zobrazenou v okamihu odoslania objednávky.',
          'Ak je tovar označený ako zľavnený, zľava sa počíta z najnižšej ceny, za ktorú bol tovar ponúkaný v predchádzajúcich 30 dňoch, v súlade s pravidlami o uvádzaní zliav.',
          'V prípade zjavne chybnej ceny (technická chyba, nezmyselná cifra) predávajúci objednávku za chybnú cenu neuplatní, bezodkladne kupujúceho informuje a navrhne správnu cenu. Objednávka je záväzná až po výslovnom potvrdení upravených podmienok.',
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
          'Dostupné spôsoby platby a dopravy sú zobrazené v pokladni (napr. dobierka, prevod, karta, Packeta, GLS, osobný odber — podľa aktuálnej ponuky).',
          'Dodacia lehota závisí od dostupnosti rastlín, sezóny a zvoleného dopravcu. Predávajúci informuje o predobjednávkach a termíne expedície v objednávke.',
          'Riziko poškodenia prechádza na kupujúceho prevzatím zásielky. Pri viditeľnom poškodení balíka odporúčame spísať zápis u dopravcu a bezodkladne nás kontaktovať s fotografiami.',
        ],
      },
      {
        heading: '5. Odstúpenie od zmluvy (spotrebiteľ)',
        body: [
          'Spotrebiteľ môže odstúpiť od zmluvy uzavretej na diaľku do 14 dní odo dňa prevzatia tovaru bez uvedenia dôvodu podľa zákona č. 102/2014 Z. z.',
          'Živé rastliny podliehajú rýchlemu zhoršeniu a sezónnym vlastnostiam. Právo na odstúpenie sa nemusí uplatniť na tovar, ktorý podlieha rýchlemu zhoršeniu alebo skaze, a na tovar zhotovený podľa požiadaviek spotrebiteľa, v rozsahu povolenom zákonom.',
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
          'Predávajúci zodpovedá za vady tovaru v rozsahu Občianskeho zákonníka a zákona o ochrane spotrebiteľa.',
          'Záruka sa nevzťahuje na uhynutie alebo poškodenie rastliny po prevzatí v dôsledku nesprávnej starostlivosti, mrazu, preschnutia, premokrenia alebo mechanického poškodenia kupujúcim.',
          'Reklamáciu uplatnite písomne alebo e-mailom na kontakt uvedený na stránke Kontakt a priložte číslo objednávky a fotografie.',
        ],
      },
      {
        heading: '8. Ochrana údajov a záverečné ustanovenia',
        body: [
          'Spracúvanie osobných údajov upravuje samostatný dokument Podmienky ochrany osobných údajov.',
          'Vzťahy sa spravujú právom Slovenskej republiky. Spotrebiteľ môže podať návrh na orgán dohľadu (SOI) alebo využiť mimosúdne riešenie sporov.',
          'Neoddeliteľnou súčasťou zmluvy sú tieto podmienky v znení zverejnenom v čase odoslania objednávky (číslo a dátum revízie sú uvedené na tejto stránke).',
        ],
      },
    ],
  },
  {
    type: 'TERMS',
    locale: 'en',
    title: 'Terms and conditions',
    intro: 'These terms govern purchases in the {sellerName} online shop. By placing an order you confirm that you have read and accept them. Seller: {sellerName}, company ID (IČO) {ico}, tax ID (DIČ) {dic}, VAT ID (IČ DPH) {icDph}, registered office {legalAddress}.',
    sections: [
      {
        heading: '1. Seller and buyer',
        body: [
          'The seller is {sellerName}, company ID (IČO) {ico}, tax ID (DIČ) {dic}, VAT ID (IČ DPH) {icDph}, registered office {legalAddress}. These details come from the shop company settings.',
          'A consumer is a natural person not buying in the course of business. Distance contracts with consumers follow EU consumer law as implemented in the shop’s market (for the Slovak deployment: Act No. 102/2014 Coll.).',
          'The parties accept electronic communication via the shop, e-mail and telephone.',
        ],
      },
      {
        heading: '2. Prices, order and delivery',
        body: [
          'Prices include VAT unless stated otherwise. The binding price is the one shown when the order is submitted.',
          'Discount labels follow the 30-day lowest-price rule where that rule applies.',
          'Submitting the order creates a payment obligation. A contract is formed when the seller confirms the order.',
          'Payment and delivery methods available at checkout apply. Inspect the parcel on delivery and report transport damage promptly with photos.',
        ],
      },
      {
        heading: '3. Withdrawal, plants and plant passports',
        body: [
          'EU consumers generally have 14 days to withdraw from a distance contract. Live plants may deteriorate quickly; statutory exceptions for goods liable to deteriorate can apply.',
          'Claims for transport damage or wrong variety should be sent within 24 hours of delivery with photographs.',
          'Movement of plants in the EU is governed by Regulation (EU) 2016/2031. Plants that require a plant passport are labelled accordingly. Public information on prohibitions and phytosanitary rules: https://www.uksup.sk/internetovy-predaj',
        ],
      },
      {
        heading: '4. Complaints and privacy',
        body: [
          'Warranty does not cover plant death after delivery caused by incorrect care, frost, drought, overwatering or mechanical damage by the buyer.',
          'Personal data is processed under the Privacy policy. The version shown at checkout is the version that applies to that order.',
        ],
      },
    ],
  },
  {
    type: 'PRIVACY',
    locale: 'uk',
    title: 'Політика конфіденційності',
    intro: 'Ця Політика пояснює, які персональні дані ми обробляємо, з якою метою та які права ви маєте. Контролер — {sellerName}, ЄДРПОУ/ІПН {ico}, адреса {legalAddress}.',
    sections: [
      {
        heading: '1. Контролер персональних даних',
        body: [
          'Контролером є {sellerName} (ЄДРПОУ/ІПН {ico}, адреса {legalAddress}).',
          'З питань обробки даних звертайтеся контактами зі сторінки «Контакти».',
        ],
      },
      {
        heading: '2. Які дані ми обробляємо',
        body: [
          'Дані профілю: ім’я, прізвище, по батькові, телефон, email, адреса доставки.',
          'Дані замовлень: склад, доставка, оплата, історія статусів.',
          'Технічні дані: необхідні cookie сесії та кошика; аналітичні cookie — лише за окремою згодою.',
        ],
      },
      {
        heading: '3. Мета та правові підстави',
        body: [
          'Оформлення, оплата й доставка замовлення — виконання договору (не «згода GDPR» на сам факт купівлі).',
          'Бухгалтерія, податки, гарантійні строки — виконання юридичного обов’язку.',
          'Аналітичні cookie та маркетинг — лише за окремою згодою, яку можна відкликати.',
        ],
      },
      {
        heading: '4. Кому передаються дані',
        body: [
          'Службам доставки, платіжним провайдерам і постачальникам email/SMS — лише в обсязі, потрібному для замовлення.',
          'Ми не продаємо персональні дані третім особам.',
        ],
      },
      {
        heading: '5. Строк зберігання та ваші права',
        body: [
          'Дані профілю зберігаються, поки діє акаунт. Дані замовлень — протягом строків обліку.',
          'Ви можете отримати копію даних або видалити акаунт у кабінеті. Видалення не знищує обов’язкові облікові записи замовлень.',
        ],
      },
    ],
  },
  {
    type: 'PRIVACY',
    locale: 'sk',
    title: 'Podmienky ochrany osobných údajov',
    intro: 'Tento dokument plní informačnú povinnosť podľa nariadenia (EÚ) 2016/679 (GDPR) a zákona č. 18/2018 Z. z. Prevádzkovateľom je {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, sídlo {legalAddress}.',
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
        heading: '4. Príjemcovia údajov',
        body: [
          'Dopravcom odovzdávame údaje nevyhnutné na doručenie (meno, adresa, telefón, prípadne suma dobierky).',
          'Platobným bránam odovzdávame údaje o transakcii; údaje platobnej karty nespracúvame my.',
          'Poskytovateľom e-mailu/SMS a hostingu e-shopu sprístupňujeme údaje v rozsahu sprostredkovateľských zmlúv. Osobné údaje spracúvame v EÚ, ak nie je pri konkrétnej službe uvedené inak.',
        ],
      },
      {
        heading: '5. Marketing a cookies',
        body: [
          'Obchodné oznámenia posielame len so súhlasom alebo v rozsahu, ktorý dovoľuje zákon o elektronických komunikáciách, s možnosťou kedykoľvek odhlásiť odber.',
          'Nevyhnutné cookies (košík, relácia, jazyk, súhlas s cookies) fungujú bez súhlasu. Analytické cookies spúšťame len po vašom súhlase; súhlas môžete odvolať v Politike cookies.',
        ],
      },
      {
        heading: '6. Vaše práva',
        body: [
          'Máte právo na prístup, opravu, vymazanie, obmedzenie, prenosnosť a namietať proti spracúvaniu na základe oprávneného záujmu.',
          'Sťažnosť môžete podať Úradu na ochranu osobných údajov SR: https://dataprotection.gov.sk/',
          'Práva si uplatníte e-mailom alebo poštou na kontakt prevádzkovateľa. Táto revízia je tá, ktorú ste videli v čase súhlasu alebo objednávky.',
        ],
      },
    ],
  },
  {
    type: 'PRIVACY',
    locale: 'en',
    title: 'Privacy policy',
    intro: 'This notice explains how we process personal data under the GDPR. The controller is {sellerName}, company ID {ico}, tax ID {dic}, VAT ID {icDph}, registered office {legalAddress}.',
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
          'Carriers, payment providers and hosting/e-mail processors receive only what is needed to deliver the service. We do not sell personal data.',
          'Necessary cookies keep the cart and session working. Analytics cookies run only with consent and can be withdrawn on the Cookie policy page.',
          'You may access, rectify, erase, restrict or port your data and object to legitimate-interest processing. You may complain to the supervisory authority in your country (for Slovakia: https://dataprotection.gov.sk/).',
        ],
      },
    ],
  },
  {
    type: 'COOKIES',
    locale: 'uk',
    title: 'Політика Cookie',
    intro: 'Ця сторінка пояснює, які cookie використовує сайт, з якою метою та як керувати згодою.',
    sections: [
      {
        heading: 'Що таке cookie',
        body: [
          'Cookie — невеликі текстові файли у браузері. Вони допомагають сайту працювати й запам’ятовувати налаштування.',
          'Контролер сайту: {sellerName}, ЄДРПОУ/ІПН {ico}, адреса {legalAddress}.',
        ],
      },
      {
        heading: 'Як ми використовуємо cookie',
        body: [
          'Необхідні cookie: кошик, сесія входу, мова, збереження вибору щодо cookie. Без них вітрина не працює коректно.',
          'Аналітичні cookie (зокрема Vercel Analytics) вмикаються лише після вашої згоди.',
        ],
      },
      {
        heading: 'Ваш вибір',
        body: [
          'Під час першого візиту можна прийняти всі cookie, залишити лише необхідні або налаштувати категорії.',
          'Вибір можна змінити будь-коли на цій сторінці. Відкликання аналітики не впливає на вже оформлені замовлення.',
        ],
      },
    ],
  },
  {
    type: 'COOKIES',
    locale: 'sk',
    title: 'Politika súborov cookie',
    intro: 'Cookies sú malé textové súbory. Táto politika vysvetľuje, ktoré kategórie používame a ako spravovať súhlas podľa ePrivacy / zákona o elektronických komunikáciách.',
    sections: [
      {
        heading: 'Kategórie',
        body: [
          'Nevyhnutné cookies: košík, prihlásenie, jazyk, uloženie voľby súhlasu. Túto kategóriu nemožno vypnúť.',
          'Analytické cookies (Vercel Analytics) spúšťame len s predchádzajúcim súhlasom. Reklamné cookies v súčasnosti nepoužívame, kým ich v e-shope nezapneme a nepožiadame o súhlas.',
          'Prevádzkovateľ: {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, sídlo {legalAddress}.',
        ],
      },
      {
        heading: 'Správa súhlasu',
        body: [
          'Súhlas udelíte bannerom alebo nastaveniami na tejto stránke. Platnosť voľby je približne 180 dní, kým ju nezmeníte.',
          'Odvolanie súhlasu zapíšeme ako novú udalosť; predchádzajúci súhlas ostáva v denníku ako dôkaz histórie.',
        ],
      },
    ],
  },
  {
    type: 'COOKIES',
    locale: 'en',
    title: 'Cookie policy',
    intro: 'This page describes the cookies we use and how you can manage consent.',
    sections: [
      {
        heading: 'Categories and choice',
        body: [
          'Necessary cookies run the cart, sign-in, language and the storage of your cookie choice.',
          'Analytics cookies (Vercel Analytics) start only after consent. You can change your choice at any time on this page.',
          'Controller: {sellerName}, company ID (IČO) {ico}, tax ID (DIČ) {dic}, VAT ID (IČ DPH) {icDph}, registered office {legalAddress}.',
        ],
      },
    ],
  },
  {
    type: 'RETURNS',
    locale: 'uk',
    title: 'Повернення та рекламації',
    intro: 'Короткі правила повернення. Деталі також є в Умовах використання.',
    sections: [
      {
        heading: 'Правила повернення',
        body: [
          'Товар належної якості можна повернути протягом 14 днів, якщо збережено товарний вигляд — з урахуванням особливостей живих рослин.',
          'Пошкодження при доставці або невідповідність сорту повідомте протягом 24 годин з фото.',
          'Продавець: {sellerName}, ЄДРПОУ/ІПН {ico}, адреса {legalAddress}.',
        ],
      },
    ],
  },
  {
    type: 'RETURNS',
    locale: 'sk',
    title: 'Odstúpenie od zmluvy a reklamácie',
    intro: 'Informácie pre spotrebiteľov o 14-dňovom odstúpení a reklamáciách pri predaji rastlín na diaľku.',
    sections: [
      {
        heading: 'Odstúpenie do 14 dní',
        body: [
          'Spotrebiteľ môže odstúpiť od zmluvy do 14 dní od prevzatia tovaru podľa zákona č. 102/2014 Z. z. bez uvedenia dôvodu.',
          'Živé rastliny môžu byť vylúčené z odstúpenia, ak ide o tovar podliehajúci rýchlemu zhoršeniu. Poškodenie prepravou alebo iný sortiment reklamujte do 24 hodín s fotografiami.',
          'Formulár: meno a adresa, číslo objednávky, dátum prevzatia, prehlásenie o odstúpení, dátum. Odošlite na e-mail predávajúceho zo stránky Kontakt.',
          'Predávajúci: {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, sídlo {legalAddress}.',
        ],
      },
      {
        heading: 'Reklamácie',
        body: [
          'Zodpovednosť za vady sa posudzuje podľa Občianskeho zákonníka. Záruka nekryje úhyn po prevzatí z dôvodu nesprávnej starostlivosti.',
        ],
      },
    ],
  },
  {
    type: 'RETURNS',
    locale: 'en',
    title: 'Returns and complaints',
    intro: 'Consumer withdrawal and plant-specific complaint rules. Details are also in the Terms.',
    sections: [
      {
        heading: '14-day withdrawal and plants',
        body: [
          'EU consumers generally have 14 days to withdraw from a distance contract. Live plants may be excluded where goods are liable to deteriorate.',
          'Report transport damage or a wrong variety within 24 hours with photos. Send name, address, order number and date of receipt to the Contact e-mail.',
          'Seller: {sellerName}, company ID (IČO) {ico}, tax ID (DIČ) {dic}, VAT ID (IČ DPH) {icDph}, registered office {legalAddress}.',
        ],
      },
    ],
  },
  {
    type: 'MARKETING_CONSENT',
    locale: 'uk',
    title: 'Згода на маркетингові повідомлення',
    intro:
      'Я хочу отримувати новини, акції та пропозиції магазину електронною поштою. Згоду можна відкликати будь-коли через посилання в листі.',
    sections: [
      {
        heading: 'Що охоплює згода',
        body: [
          'Маркетингові листи про товари, акції та новини розсадника. Це окремо від листів про ваші замовлення.',
          'Згоду можна відкликати одним кліком у кожному маркетинговому листі.',
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
