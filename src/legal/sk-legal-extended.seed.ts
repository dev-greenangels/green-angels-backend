import { legalSeedEntry } from './legal-seed-builders'
import type { LegalSeedEntry } from './legal-seed.types'

export const SK_EXTENDED_LEGAL_SEED: LegalSeedEntry[] = [
  legalSeedEntry(
    'TERMS',
    'de',
    "Nutzungsbedingungen",
    "These terms govern purchases at {sellerName} (IČO {ico}, DIČ {dic}, IČ DPH {icDph}, {legalAddress}) under Slovak and EU consumer law.",
    [
        {
          "heading": "1. General",
          "body": [
            "These Terms govern purchases between {sellerName} (“Seller”) and customers of the online shop.",
            "By submitting an order you confirm you have read and accept these Terms."
          ]
        },
        {
          "heading": "2. Ordering",
          "body": [
            "Orders may be placed via the website, phone, or email.",
            "We send an order confirmation to the email provided.",
            "The Seller may refuse an order if goods are unavailable or the customer cannot be contacted."
          ]
        },
        {
          "heading": "3. Prices and payment",
          "body": [
            "Prices are shown in the store currency (EUR / HUF) and include VAT unless stated otherwise.",
            "The price is fixed when the order is placed.",
            "Available payment methods appear at checkout (e.g. card via Stripe, bank transfer, cash on delivery — as configured)."
          ]
        },
        {
          "heading": "4. Delivery",
          "body": [
            "Delivery uses methods available at checkout (e.g. Packeta, GLS, pickup — as configured).",
            "Timing depends on the method and destination country.",
            "Delivery cost follows carrier tariffs and weight / dimensions."
          ]
        },
        {
          "heading": "5. Withdrawal and complaints",
          "body": [
            "Consumers may withdraw from a distance contract within 14 days under EU/SK law — with possible exceptions for perishable goods (including live plants), per the returns policy.",
            "Report transport damage promptly with photos.",
            "Return shipping is paid by the buyer except for defective goods."
          ]
        },
        {
          "heading": "6. Warranty",
          "body": [
            "The Seller is responsible for planting material quality at sale.",
            "Warranty excludes post-collection damage from improper care or weather."
          ]
        },
        {
          "heading": "7. Privacy",
          "body": [
            "Personal data is processed under the Privacy Policy and applicable EU/SK law.",
            "We use data to fulfil orders and communicate; we share it with third parties only as necessary."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'PRIVACY',
    'de',
    "Datenschutzerklärung",
    "GDPR privacy notice. Controller: {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, {legalAddress}. Slovak/EU law applies.",
    [
        {
          "heading": "1. Verantwortlicher",
          "body": [
            "Verantwortlicher ist der Betreiber des Pflanzenshops (Einzelunternehmer / juristische Person unter „Kontakt“ und in den Nutzungsbedingungen aufgeführt).",
            "Bei Fragen zur Verarbeitung personenbezogener Daten nutzen Sie bitte die Kontakte auf der Seite „Kontakt“."
          ]
        },
        {
          "heading": "2. Welche Daten wir verarbeiten",
          "body": [
            "Profildaten: Vorname, Nachname, Vatersname, Telefon, E-Mail, Lieferadresse.",
            "Bestelldaten: Bestellinhalt, Lieferart und -adresse, Zahlungsart, Statusverlauf.",
            "Technische Daten: Cookies, Nutzungsdaten der Website (nur bei Einwilligung zu Analyse-Cookies)."
          ]
        },
        {
          "heading": "3. Zweck und Rechtsgrundlage",
          "body": [
            "Kundendaten werden zur Aufgabe und Abwicklung von Bestellungen sowie zur Kommunikation über Lieferung und Support verarbeitet — auf Basis der Vertragserfüllung und Nutzereinwilligung.",
            "Analyse-Cookies werden nur mit separater Einwilligung verwendet, die Sie jederzeit auf der Cookie-Richtlinien-Seite widerrufen können."
          ]
        },
        {
          "heading": "4. Wer die Daten erhält",
          "body": [
            "Daten können an Versanddienstleister, Zahlungsanbieter und E-Mail-/SMS-Benachrichtigungsdienste weitergegeben werden — nur in dem Umfang, der zur Bestellabwicklung erforderlich ist.",
            "Wir verkaufen keine personenbezogenen Daten an Dritte."
          ]
        },
        {
          "heading": "5. Aufbewahrungsdauer",
          "body": [
            "Profildaten werden gespeichert, solange das Konto aktiv ist. Bestelldaten werden für die für Buchhaltung und Steuerunterlagen erforderliche Dauer aufbewahrt.",
            "Sie können Ihr Konto jederzeit in den Kontoeinstellungen löschen — siehe Abschnitt unten."
          ]
        },
        {
          "heading": "6. Ihre Rechte",
          "body": [
            "Sie haben das Recht auf Auskunft, Berichtigung, Löschung (Anonymisierung), Einschränkung und Widerspruch gegen die Verarbeitung Ihrer Daten.",
            "Sie können eine Kopie Ihrer Daten herunterladen oder Ihr Konto in Ihrer Übersicht unter „Einstellungen“ → „Daten & Datenschutz“ löschen."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'COOKIES',
    'de',
    "Cookie-Richtlinie",
    "Diese Seite erläutert, welche Cookies die Website verwendet, zu welchem Zweck und wie Sie Ihre Einwilligung verwalten.",
    [
        {
          "heading": "Was sind Cookies",
          "body": [
            "Cookies sind kleine Textdateien, die in Ihrem Browser gespeichert werden, wenn Sie die Website besuchen. Sie helfen der Website korrekt zu funktionieren und Ihre Einstellungen zu speichern."
          ]
        },
        {
          "heading": "Wie wir Cookies verwenden",
          "body": [
            "Notwendige Cookies ermöglichen Warenkorb, Anmeldung und gespeicherte Sprach-/Regionseinstellungen — ohne sie funktioniert die Website nicht korrekt.",
            "Analyse-Cookies (Vercel Analytics) helfen uns zu verstehen, welche Seiten beliebt sind und wie wir die Website verbessern können. Sie werden nur nach Ihrer Einwilligung aktiviert."
          ]
        },
        {
          "heading": "Ihre Wahl",
          "body": [
            "Beim ersten Besuch sehen Sie ein Banner, in dem Sie alle Cookies akzeptieren, nur notwendige behalten oder Kategorien einzeln anpassen können.",
            "Sie können Ihre Wahl jederzeit unten auf dieser Seite ändern."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'MARKETING_CONSENT',
    'de',
    "News und Angebote",
    "Ich möchte Marketing-E-Mails erhalten.",
    [
        {
          "heading": "Scope",
          "body": [
            "Newsletter abonnieren — getrennt von Bestell-E-Mails. Jederzeit widerrufbar."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'TERMS',
    'hu',
    "Felhasználási feltételek",
    "These terms govern purchases at {sellerName} (IČO {ico}, DIČ {dic}, IČ DPH {icDph}, {legalAddress}) under Slovak and EU consumer law.",
    [
        {
          "heading": "1. General",
          "body": [
            "These Terms govern purchases between {sellerName} (“Seller”) and customers of the online shop.",
            "By submitting an order you confirm you have read and accept these Terms."
          ]
        },
        {
          "heading": "2. Ordering",
          "body": [
            "Orders may be placed via the website, phone, or email.",
            "We send an order confirmation to the email provided.",
            "The Seller may refuse an order if goods are unavailable or the customer cannot be contacted."
          ]
        },
        {
          "heading": "3. Prices and payment",
          "body": [
            "Prices are shown in the store currency (EUR / HUF) and include VAT unless stated otherwise.",
            "The price is fixed when the order is placed.",
            "Available payment methods appear at checkout (e.g. card via Stripe, bank transfer, cash on delivery — as configured)."
          ]
        },
        {
          "heading": "4. Delivery",
          "body": [
            "Delivery uses methods available at checkout (e.g. Packeta, GLS, pickup — as configured).",
            "Timing depends on the method and destination country.",
            "Delivery cost follows carrier tariffs and weight / dimensions."
          ]
        },
        {
          "heading": "5. Withdrawal and complaints",
          "body": [
            "Consumers may withdraw from a distance contract within 14 days under EU/SK law — with possible exceptions for perishable goods (including live plants), per the returns policy.",
            "Report transport damage promptly with photos.",
            "Return shipping is paid by the buyer except for defective goods."
          ]
        },
        {
          "heading": "6. Warranty",
          "body": [
            "The Seller is responsible for planting material quality at sale.",
            "Warranty excludes post-collection damage from improper care or weather."
          ]
        },
        {
          "heading": "7. Privacy",
          "body": [
            "Personal data is processed under the Privacy Policy and applicable EU/SK law.",
            "We use data to fulfil orders and communicate; we share it with third parties only as necessary."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'PRIVACY',
    'hu',
    "Adatvédelmi irányelvek",
    "GDPR privacy notice. Controller: {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, {legalAddress}. Slovak/EU law applies.",
    [
        {
          "heading": "1. Adatkezelő",
          "body": [
            "Az adatkezelő a növénybolt üzemeltetője (a „Kapcsolat” oldalon és a Felhasználási feltételekben feltüntetett egyéni vállalkozó / jogi személy).",
            "Személyes adatok kezelésével kapcsolatos kérdésekben kérjük, használja a „Kapcsolat” oldalon feltüntetett elérhetőségeket."
          ]
        },
        {
          "heading": "2. Milyen adatokat kezelünk",
          "body": [
            "Profiladatok: keresztnév, vezetéknév, apai név, telefon, e-mail, szállítási cím.",
            "Rendelési adatok: rendelés tartalma, szállítási mód és cím, fizetési mód, állapotelőzmények.",
            "Technikai adatok: sütik, oldalhasználati adatok (csak ha hozzájárult az analitikai sütikhez)."
          ]
        },
        {
          "heading": "3. Cél és jogalap",
          "body": [
            "Az ügyféladatokat rendelések leadásához és teljesítéséhez, valamint a szállításról és támogatásról való kommunikációhoz kezeljük — szerződés teljesítése és felhasználói hozzájárulás alapján.",
            "Az analitikai sütiket csak külön hozzájárulással használjuk, amelyet bármikor visszavonhat a Süti szabályzat oldalon."
          ]
        },
        {
          "heading": "4. Kinek adjuk át az adatokat",
          "body": [
            "Az adatokat megoszthatjuk szállítási fuvarozókkal, fizetési szolgáltatókkal és e-mail/SMS értesítési szolgáltatókkal — csak a rendelés teljesítéséhez szükséges mértékben.",
            "Személyes adatokat harmadik feleknek nem értékesítünk."
          ]
        },
        {
          "heading": "5. Megőrzési idő",
          "body": [
            "A profiladatokat a fiók aktív ideje alatt őrizzük meg. A rendelési adatokat a könyvelési és adózási előírások által megkövetelt ideig tároljuk.",
            "Fiókját bármikor törölheti a fiókbeállításokban — lásd az alábbi szakaszt."
          ]
        },
        {
          "heading": "6. Az Ön jogai",
          "body": [
            "Önnek joga van hozzáférni, helyesbíteni, törölni (anonimizálni), korlátozni és tiltakozni adatai kezelése ellen.",
            "Adatai másolatát letöltheti, vagy törölheti fiókját az irányítópulton, a „Beállítások” → „Adatok és adatvédelem” menüpontban."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'COOKIES',
    'hu',
    "Süti szabályzat",
    "Ez az oldal ismerteti, milyen sütiket használ az oldal, milyen célból, és hogyan kezelheti hozzájárulását.",
    [
        {
          "heading": "Mik azok a sütik",
          "body": [
            "A sütik kis szöveges fájlok, amelyeket a böngésző tárol, amikor meglátogatja az oldalt. Segítenek a helyes működésben és a beállítások megjegyzésében."
          ]
        },
        {
          "heading": "Hogyan használjuk a sütiket",
          "body": [
            "A szükséges sütik működtetik a kosarat, a bejelentkezést és a mentett nyelvi/régiós beállításokat — ezek nélkül az oldal nem működik megfelelően.",
            "Az analitikai sütik (Vercel Analytics) segítenek megérteni, mely oldalak népszerűek, és hogyan javíthatjuk az oldalt. Csak hozzájárulás után aktiválódnak."
          ]
        },
        {
          "heading": "Az Ön választása",
          "body": [
            "Az első látogatáskor egy sáv jelenik meg, ahol elfogadhatja az összes sütit, megtarthatja csak a szükségeseket, vagy egyenként testreszabhatja a kategóriákat.",
            "Választását bármikor módosíthatja az alábbiakban ezen az oldalon."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'MARKETING_CONSENT',
    'hu',
    "Hírek és ajánlatok",
    "Szeretnék marketing e-maileket kapni.",
    [
        {
          "heading": "Scope",
          "body": [
            "Iratkozzon fel a hírlevélre — külön a rendelési e-mailektől. Bármikor visszavonható."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'TERMS',
    'cs',
    "Obchodní podmínky",
    "These terms govern purchases at {sellerName} (IČO {ico}, DIČ {dic}, IČ DPH {icDph}, {legalAddress}) under Slovak and EU consumer law.",
    [
        {
          "heading": "1. General",
          "body": [
            "These Terms govern purchases between {sellerName} (“Seller”) and customers of the online shop.",
            "By submitting an order you confirm you have read and accept these Terms."
          ]
        },
        {
          "heading": "2. Ordering",
          "body": [
            "Orders may be placed via the website, phone, or email.",
            "We send an order confirmation to the email provided.",
            "The Seller may refuse an order if goods are unavailable or the customer cannot be contacted."
          ]
        },
        {
          "heading": "3. Prices and payment",
          "body": [
            "Prices are shown in the store currency (EUR / HUF) and include VAT unless stated otherwise.",
            "The price is fixed when the order is placed.",
            "Available payment methods appear at checkout (e.g. card via Stripe, bank transfer, cash on delivery — as configured)."
          ]
        },
        {
          "heading": "4. Delivery",
          "body": [
            "Delivery uses methods available at checkout (e.g. Packeta, GLS, pickup — as configured).",
            "Timing depends on the method and destination country.",
            "Delivery cost follows carrier tariffs and weight / dimensions."
          ]
        },
        {
          "heading": "5. Withdrawal and complaints",
          "body": [
            "Consumers may withdraw from a distance contract within 14 days under EU/SK law — with possible exceptions for perishable goods (including live plants), per the returns policy.",
            "Report transport damage promptly with photos.",
            "Return shipping is paid by the buyer except for defective goods."
          ]
        },
        {
          "heading": "6. Warranty",
          "body": [
            "The Seller is responsible for planting material quality at sale.",
            "Warranty excludes post-collection damage from improper care or weather."
          ]
        },
        {
          "heading": "7. Privacy",
          "body": [
            "Personal data is processed under the Privacy Policy and applicable EU/SK law.",
            "We use data to fulfil orders and communicate; we share it with third parties only as necessary."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'PRIVACY',
    'cs',
    "Privacy policy",
    "GDPR privacy notice. Controller: {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, {legalAddress}. Slovak/EU law applies.",
    [
        {
          "heading": "1. Data controller",
          "body": [
            "The data controller is the operator of the plant store (the sole trader / legal entity listed under \"Contacts\" and in the Terms of use).",
            "For questions about personal data processing, please use the contacts listed on the \"Contacts\" page."
          ]
        },
        {
          "heading": "2. What data we process",
          "body": [
            "Profile data: first name, last name, patronymic, phone, email, delivery address.",
            "Order data: order contents, delivery method and address, payment method, status history.",
            "Technical data: cookies, site usage data (only if you consented to analytics cookies)."
          ]
        },
        {
          "heading": "3. Purpose and legal basis",
          "body": [
            "Customer data is processed to place and fulfil orders and to communicate about delivery and support — based on contract performance and user consent.",
            "Analytics cookies are used only with a separate consent, which you can withdraw at any time on the Cookie policy page."
          ]
        },
        {
          "heading": "4. Who receives the data",
          "body": [
            "Data may be shared with delivery carriers, payment providers and email/SMS notification providers — only to the extent needed to fulfil an order.",
            "We do not sell personal data to third parties."
          ]
        },
        {
          "heading": "5. Retention period",
          "body": [
            "Profile data is kept while the account is active. Order data is kept for the period required for accounting and tax records.",
            "You can delete your account at any time from account settings — see the section below."
          ]
        },
        {
          "heading": "6. Your rights",
          "body": [
            "You have the right to access, correct, delete (anonymize), restrict, and object to the processing of your data.",
            "You can download a copy of your data or delete your account from your dashboard, under \"Settings\" → \"Data & privacy\"."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'COOKIES',
    'cs',
    "Cookie policy",
    "This page explains which cookies the site uses, for what purpose, and how to manage your consent.",
    [
        {
          "heading": "What are cookies",
          "body": [
            "Cookies are small text files stored in your browser when you visit the site. They help it work correctly and remember your preferences."
          ]
        },
        {
          "heading": "How we use cookies",
          "body": [
            "Necessary cookies power the cart, sign-in and saved language/region preferences — without them the site will not work correctly.",
            "Analytics cookies (Vercel Analytics) help us understand which pages are popular and how to improve the site. They only activate after you consent."
          ]
        },
        {
          "heading": "Your choice",
          "body": [
            "On your first visit you see a banner where you can accept all cookies, keep only necessary ones, or customize categories individually.",
            "You can change your choice at any time below on this page."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'MARKETING_CONSENT',
    'cs',
    "Novinky a nabídky",
    "Chci dostávat marketingové e-maily.",
    [
        {
          "heading": "Scope",
          "body": [
            "Přihlaste se k odběru — odděleně od e-mailů o objednávkách. Souhlas můžete kdykoli odvolat."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'TERMS',
    'uk',
    "Умови використання",
    "Ці умови регулюють купівлю в інтернет-магазині {sellerName} (IČO {ico}, DIČ {dic}, IČ DPH {icDph}, {legalAddress}) відповідно до права Словацької республіки та ЄС.",
    [
        {
          "heading": "1. Všeobecné ustanovenia",
          "body": [
            "Tieto obchodné podmienky upravujú kúpu tovaru v internetovom obchode medzi {sellerName} (ďalej „Predávajúci“) a kupujúcimi.",
            "Odoslaním objednávky kupujúci potvrdzuje, že sa s podmienkami oboznámil a súhlasí s nimi."
          ]
        },
        {
          "heading": "2. Objednávka",
          "body": [
            "Objednávky sa uzatvárajú cez web, telefón alebo e-mail.",
            "Po odoslaní objednávky zasielame potvrdenie na uvedený e-mail.",
            "Predávajúci môže objednávku odmietnuť pri nedostupnosti tovaru alebo nemožnosti kontaktovať kupujúceho."
          ]
        },
        {
          "heading": "3. Ceny a platba",
          "body": [
            "Ceny sú uvedené v mene obchodu (EUR / HUF) a zahŕňajú DPH, ak nie je uvedené inak.",
            "Cena sa fixuje v okamihu odoslania objednávky.",
            "Dostupné spôsoby platby sú zobrazené v pokladni (napr. karta online cez Stripe, bankový prevod, dobierka — podľa nastavení)."
          ]
        },
        {
          "heading": "4. Doprava",
          "body": [
            "Doprava prebieha spôsobmi dostupnými v pokladni (napr. Packeta, GLS, osobný odber — podľa nastavení obchodu).",
            "Termíny závisia od zvoleného spôsobu a krajiny doručenia.",
            "Cena dopravy sa počíta podľa taríf dopravcu a hmotnosti / rozmerov."
          ]
        },
        {
          "heading": "5. Odstúpenie a reklamácie",
          "body": [
            "Spotrebiteľ má právo odstúpiť od zmluvy uzatvorenej na diaľku v lehote 14 dní v súlade s právom EÚ/SR — s možnými výnimkami pre tovar podliehajúci skaze (vrátane živých rastlín), podľa aktuálneho reklamačného poriadku.",
            "Poškodenie pri preprave hláste čo najskôr s fotodokumentáciou.",
            "Náklady na vrátenie znáša kupujúci, okrem vád tovaru."
          ]
        },
        {
          "heading": "6. Záruka",
          "body": [
            "Predávajúci zodpovedá za kvalitu sadbového materiálu v čase predaja.",
            "Záruka sa nevzťahuje na poškodenie po prevzatí vplyvom nesprávnej starostlivosti alebo počasia."
          ]
        },
        {
          "heading": "7. Ochrana údajov",
          "body": [
            "Spracúvanie osobných údajov upravuje Politika ochrany osobných údajov a platné právne predpisy EÚ/SR.",
            "Údaje používame na splnenie objednávky a komunikáciu; tretím stranám ich poskytujeme len v nevyhnutnom rozsahu."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'PRIVACY',
    'uk',
    "Політика конфіденційності",
    "Повідомлення про обробку даних за GDPR. Контролер: {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, {legalAddress}. Застосовується право СР/ЄС.",
    [
        {
          "heading": "1. Контролер персональних даних",
          "body": [
            "Контролером персональних даних є продавець магазину рослин (ФОП/юридична особа, зазначена в розділі «Контакти» та Умовах використання).",
            "З питань обробки персональних даних можна звертатися контактами, вказаними на сторінці «Контакти»."
          ]
        },
        {
          "heading": "2. Які дані ми обробляємо",
          "body": [
            "Дані профілю: ім'я, прізвище, по батькові, телефон, email, адреса доставки.",
            "Дані замовлень: склад замовлення, спосіб та адреса доставки, спосіб оплати, історія статусів.",
            "Технічні дані: cookie, дані про використання сайту (за наявності згоди на аналітичні cookie)."
          ]
        },
        {
          "heading": "3. Мета та правові підстави обробки",
          "body": [
            "Обробка даних клієнтів здійснюється для оформлення та виконання замовлень, зв'язку щодо доставки та підтримки — на підставі виконання договору та згоди користувача.",
            "Аналітичні cookie використовуються лише за окремою згодою, яку можна відкликати в будь-який час у Політиці Cookie."
          ]
        },
        {
          "heading": "4. Кому передаються дані",
          "body": [
            "Дані можуть передаватися службам доставки, платіжним провайдерам та постачальникам email/SMS-сповіщень — виключно в обсязі, необхідному для виконання замовлення.",
            "Ми не продаємо персональні дані третім особам."
          ]
        },
        {
          "heading": "5. Строк зберігання",
          "body": [
            "Дані профілю зберігаються, поки діє акаунт. Дані замовлень зберігаються протягом строку, необхідного для бухгалтерського та податкового обліку.",
            "Ви можете видалити акаунт у будь-який час у налаштуваннях кабінету — див. розділ нижче."
          ]
        },
        {
          "heading": "6. Ваші права",
          "body": [
            "Ви маєте право на доступ до своїх даних, їх виправлення, видалення (анонімізацію), обмеження обробки та заперечення проти обробки.",
            "Завантажити копію своїх даних або видалити акаунт можна в особистому кабінеті, у розділі «Налаштування» → «Дані та конфіденційність»."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'COOKIES',
    'uk',
    "Політика Cookie",
    "Файли cookie та згода відповідно до ePrivacy та законодавства ЄС. Контролер: {sellerName}, IČO {ico}.",
    [
        {
          "heading": "Що таке cookie",
          "body": [
            "Cookie — це невеликі текстові файли, які зберігаються у вашому браузері під час відвідування сайту та допомагають йому працювати коректно й запам'ятовувати ваші налаштування."
          ]
        },
        {
          "heading": "Як ми використовуємо cookie",
          "body": [
            "Необхідні cookie використовуються для роботи кошика, входу в акаунт та збереження мовних і регіональних налаштувань — без них сайт не працюватиме коректно.",
            "Аналітичні cookie (Vercel Analytics) допомагають розуміти, які сторінки популярні та як покращити сайт. Вони активуються лише після вашої згоди."
          ]
        },
        {
          "heading": "Ваш вибір",
          "body": [
            "Під час першого відвідування сайту ви бачите банер з вибором: прийняти всі cookie, залишити лише необхідні або налаштувати категорії окремо.",
            "Свій вибір можна змінити в будь-який момент нижче на цій сторінці."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'MARKETING_CONSENT',
    'uk',
    "Новини та пропозиції",
    "Я хочу отримувати маркетингові повідомлення електронною поштою.",
    [
        {
          "heading": "Зміст",
          "body": [
            "Підпишіться на розсилку — окремо від листів про замовлення. Згоду можна відкликати в будь-який час."
          ]
        }
      ],
  ),
]
