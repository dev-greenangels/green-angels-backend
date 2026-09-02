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
    "Diese Datenschutzerklärung erfüllt die Informationspflicht nach der DSGVO und dem Gesetz Nr. 18/2018 Z. z. über den Schutz personenbezogener Daten.",
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
            "Technische Daten: Cookies sowie optionale Analyse- und Marketing-/Werbetechnologien (nur nach Ihrer Einwilligung). Dazu können Geräte-/Browserinformationen, Seiteninteraktionen und der Einwilligungsstatus gehören. Über Tag Manager / dataLayer senden wir keine Namen, E-Mails, Telefonnummern oder Adressen."
          ]
        },
        {
          "heading": "3. Zweck und Rechtsgrundlage",
          "body": [
            "Kundendaten werden zur Aufgabe und Abwicklung von Bestellungen sowie zur Kommunikation über Lieferung und Support verarbeitet — auf Basis der Vertragserfüllung und Nutzereinwilligung.",
            "Optionale Analyse- und Marketing-/Werbetechnologien werden nur mit separater Einwilligung verwendet. Wir nutzen Google Tag Manager zur Steuerung freigegebener Tags; Google Analytics 4 und Google Ads sind derzeit nicht aktiv. Einwilligungen können Sie jederzeit auf der Cookie-Richtlinien-Seite ändern oder widerrufen."
          ]
        },
        {
          "heading": "4. Wer die Daten erhält",
          "body": [
            "Daten können an Versanddienstleister, Zahlungsanbieter und E-Mail-/SMS-Benachrichtigungsdienste weitergegeben werden — nur in dem Umfang, der zur Bestellabwicklung erforderlich ist.",
            "Technische IT-/Hosting-Anbieter können Vercel (Hosting und Vercel Analytics, sofern Analytics-Einwilligung vorliegt) sowie Google Tag Manager als Tag-Infrastruktur umfassen — ohne dass dadurch Google Ads oder GA4 aktiv werden.",
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
         ,
            "E-Mail zur Ausübung Ihrer Rechte (DSGVO): {supportEmail}"
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
            "Notwendige Cookies: erforderlich für Kernfunktionen (z. B. Warenkorb, Anmeldung/Sitzung, Sprache und Speicherung Ihrer Cookie-Wahl). Diese Kategorie kann in den Einwilligungseinstellungen nicht deaktiviert werden.",
            "Analyse-Cookies/Technologien: optional. Sie helfen uns zu verstehen, wie Besucher die Website nutzen (derzeit einschließlich Vercel Analytics). Sie werden erst nach Einwilligung zur Kategorie Analyse aktiv. Google Analytics 4 ist derzeit nicht aktiv.",
            "Marketing-Cookies/Technologien: optional. Sie können für Werbemessung, Conversion-Messung und verwandte Werbefunktionen genutzt werden, wenn sie aktiviert sind. Sie werden erst nach Einwilligung zur Kategorie Marketing aktiv. Google Ads und Google-Ads-Conversions sind derzeit nicht implementiert und erheben keine Daten.",
            "Wir nutzen Google Tag Manager als Tag-Management-Werkzeug. Tag Manager selbst ist keine Werbedienstleistung; er steuert freigegebene Mess- und Marketing-Tags gemäß Ihrer Einwilligung."
          ]
        },
        {
          "heading": "Ihre Wahl",
          "body": [
            "Vor Ihrer Entscheidung bleiben Analyse und Marketing ausgeschaltet; nur notwendige Cookies sind aktiv.",
            "Beim ersten Besuch können Sie alles akzeptieren, nur Notwendige behalten oder Analyse und Marketing unabhängig ein- oder ausschalten.",
            "Sie können Ihre Wahl jederzeit unten auf dieser Seite ändern. Die gespeicherte Einwilligung (Cookie ga-cookie-consent) gilt etwa 180 Tage, sofern Sie sie nicht ändern. Wir speichern Einwilligungsentscheidungen zu Compliance- und Audit-Zwecken."
          ]
        }
,
      {
        heading: "Ihre Rechte",
        body: [
                  "Sie können Ihre Einwilligung zu Analyse- oder Marketing-Technologien jederzeit widerrufen. Details in der [[privacy|Datenschutzerklärung]]."
        ],
      },
      {
        heading: "Kontakt",
        body: [
                  "Widerruf oder Anfragen: {supportEmail}"
        ],
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
    "Ez az adatvédelmi tájékoztató teljesíti a GDPR és a 18/2018 Z. z. törvény szerinti tájékoztatási kötelezettséget.",
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
            "Technikai adatok: sütik, valamint opcionális analitikai és marketing/hirdetési technológiák (csak hozzájárulás után). Ide tartozhatnak eszköz-/böngészőadatok, oldalinterakciók és a hozzájárulás állapota. A Tag Manager / dataLayer révén nem küldünk nevet, e-mailt, telefont vagy címet."
          ]
        },
        {
          "heading": "3. Cél és jogalap",
          "body": [
            "Az ügyféladatokat rendelések leadásához és teljesítéséhez, valamint a szállításról és támogatásról való kommunikációhoz kezeljük — szerződés teljesítése és felhasználói hozzájárulás alapján.",
            "Az opcionális analitikai és marketing/hirdetési technológiákat csak külön hozzájárulással használjuk. A Google Tag Managert a jóváhagyott címkék vezérlésére használjuk; a Google Analytics 4 és a Google Ads jelenleg nem aktív. A hozzájárulást bármikor módosíthatja vagy visszavonhatja a Süti szabályzat oldalon."
          ]
        },
        {
          "heading": "4. Kinek adjuk át az adatokat",
          "body": [
            "Az adatokat megoszthatjuk szállítási fuvarozókkal, fizetési szolgáltatókkal és e-mail/SMS értesítési szolgáltatókkal — csak a rendelés teljesítéséhez szükséges mértékben.",
            "A technikai IT-/hosting szolgáltatók közé tartozhat a Vercel (hosting és Vercel Analytics, ha van analitikai hozzájárulás), valamint a Google Tag Manager címkeinfrastruktúraként — ez önmagában nem aktiválja a Google Ads vagy a GA4 szolgáltatást.",
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
         ,
            "E-mail a jogok gyakorlásához (GDPR): {supportEmail}"
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
            "Szükséges sütik: az oldal alapműködéséhez kellenek (pl. kosár, bejelentkezés/munkamenet, nyelv és a sütihozzájárulás mentése). Ezt a kategóriát a hozzájárulás-kezelőben nem lehet kikapcsolni.",
            "Analitikai sütik/technológiák: opcionálisak. Segítenek megérteni, hogyan használják a látogatók az oldalt (jelenleg beleértve a Vercel Analytics szolgáltatást). Csak az Analitika hozzájárulás után aktívak. A Google Analytics 4 jelenleg nem aktív.",
            "Marketing sütik/technológiák: opcionálisak. Hirdetésmérésre, konverziómérésre és kapcsolódó hirdetési funkciókra használhatók, ha be vannak kapcsolva. Csak a Marketing hozzájárulás után aktívak. A Google Ads és a Google Ads konverziók jelenleg nincsenek implementálva, és nem gyűjtenek adatokat.",
            "A Google Tag Managert címkekezelő eszközként használjuk. Maga a Tag Manager nem hirdetési szolgáltatás; a jóváhagyott mérési és marketing címkéket a hozzájárulása szerint vezérli."
          ]
        },
        {
          "heading": "Az Ön választása",
          "body": [
            "Döntése előtt az Analitika és a Marketing ki van kapcsolva; csak a szükséges sütik maradnak aktívak.",
            "Az első látogatáskor elfogadhatja az összeset, megtarthatja csak a szükségeseket, vagy külön be-/kikapcsolhatja az Analitikát és a Marketinget.",
            "Választását bármikor módosíthatja ezen az oldalon. A mentett hozzájárulás (ga-cookie-consent süti) körülbelül 180 napig érvényes, amíg nem változtatja meg. A hozzájárulási döntéseket megfelelőségi és audit célból rögzítjük."
          ]
        }
,
      {
        heading: "Az Ön jogai",
        body: [
                  "Az analitikai vagy marketing technológiákhoz adott hozzájárulást bármikor visszavonhatja. Részletek: [[privacy|Adatvédelmi irányelvek]]."
        ],
      },
      {
        heading: "Kapcsolat",
        body: [
                  "Visszavonás vagy kérelmek: {supportEmail}"
        ],
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
    "Toto prohlášení o ochraně osobních údajů plní informační povinnost podle GDPR a zákona č. 18/2018 Z. z.",
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
            "Technická data: cookies a volitelné analytické a marketingové/reklamní technologie (pouze po vašem souhlasu). Mohou zahrnovat informace o zařízení/prohlížeči, interakce se stránkou a stav souhlasu. Prostřednictvím Tag Manageru / dataLayer neodesíláme jméno, e-mail, telefon ani adresu."
          ]
        },
        {
          "heading": "3. Purpose and legal basis",
          "body": [
            "Customer data is processed to place and fulfil orders and to communicate about delivery and support — based on contract performance and user consent.",
            "Volitelné analytické a marketingové/reklamní technologie používáme jen se samostatným souhlasem. Google Tag Manager používáme ke správě schválených značek; Google Analytics 4 a Google Ads momentálně nejsou aktivní. Souhlas můžete kdykoli změnit nebo odvolat na stránce Zásady cookies."
          ]
        },
        {
          "heading": "4. Who receives the data",
          "body": [
            "Údaje mohou být sdíleny s dopravci, poskytovateli plateb a e-mailových/SMS notifikací — pouze v rozsahu potřebném k vyřízení objednávky.",
            "Techničtí poskytovatelé IT/hostingu mohou zahrnovat Vercel (hosting a Vercel Analytics při souhlasu s analytikou) a Google Tag Manager jako infrastrukturu značek — to samo o sobě neaktivuje Google Ads ani GA4.",
            "Osobní údaje třetím stranám neprodáváme."
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
         ,
            "E-mail pro uplatnění práv (GDPR): {supportEmail}"
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
          "heading": "Jak cookies používáme",
          "body": [
            "Nezbytné cookies: nutné pro základní fungování webu (např. košík, přihlášení/relace, jazyk a uložení volby souhlasu). Tuto kategorii nelze ve správě souhlasu vypnout.",
            "Analytické cookies/technologie: volitelné. Pomáhají nám pochopit, jak návštěvníci web používají (aktuálně včetně Vercel Analytics). Spouštějí se až po souhlasu s kategorií Analytické. Google Analytics 4 momentálně není aktivní.",
            "Marketingové cookies/technologie: volitelné. Mohou sloužit k měření reklamy, konverzí a souvisejícím reklamním funkcím, pokud jsou zapnuté. Spouštějí se až po souhlasu s kategorií Marketingové. Google Ads a Google Ads konverze momentálně nejsou implementovány a aktivně nesbírají údaje.",
            "Google Tag Manager používáme jako nástroj pro správu značek. Samotný Tag Manager není reklamní služba; řídí schválené měřicí a marketingové značky podle vašeho souhlasu."
          ]
        },
        {
          "heading": "Vaše volba",
          "body": [
            "Před vaší volbou zůstávají analytické i marketingové technologie vypnuté; aktivní zůstávají jen nezbytné cookies.",
            "Při první návštěvě můžete přijmout vše, ponechat jen nezbytné, nebo samostatně zapnout/vypnout Analytické a Marketingové.",
            "Volbu můžete kdykoli změnit na této stránce. Uložená volba souhlasu (soubor ga-cookie-consent) platí přibližně 180 dní, dokud ji nezměníte. Volby souhlasu zaznamenáváme pro účely souladu a auditu."
          ]
        }
,
      {
        heading: "Vaše práva",
        body: [
                  "Souhlas s analytickými nebo marketingovými technologiemi můžete kdykoli odvolat. Podrobnosti v [[privacy|Zásadách ochrany osobních údajů]]."
        ],
      },
      {
        heading: "Kontakt",
        body: [
                  "Odvolání nebo žádosti: {supportEmail}"
        ],
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
    "Це повідомлення виконує інформаційний обов’язок згідно з GDPR та законом СР № 18/2018 Z. z.",
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
            "Технічні дані: cookie, а також необов’язкові аналітичні та маркетингові/рекламні технології (лише після вашої згоди). Можуть включати дані про пристрій/браузер, взаємодії зі сторінкою та стан згоди. Через Tag Manager / dataLayer ми не надсилаємо ім’я, email, телефон чи адресу."
          ]
        },
        {
          "heading": "3. Мета та правові підстави обробки",
          "body": [
            "Обробка даних клієнтів здійснюється для оформлення та виконання замовлень, зв'язку щодо доставки та підтримки — на підставі виконання договору та згоди користувача.",
            "Необов’язкові аналітичні та маркетингові/рекламні технології використовуються лише за окремою згодою. Google Tag Manager використовуємо для керування схваленими тегами; Google Analytics 4 і Google Ads наразі не активні. Згоду можна будь-коли змінити або відкликати в Політиці Cookie."
          ]
        },
        {
          "heading": "4. Кому передаються дані",
          "body": [
            "Дані можуть передаватися службам доставки, платіжним провайдерам та постачальникам email/SMS-сповіщень — виключно в обсязі, необхідному для виконання замовлення.",
            "Технічні ІТ/хостинг-провайдери можуть включати Vercel (хостинг і Vercel Analytics за згоди на аналітику) та Google Tag Manager як інфраструктуру тегів — це саме по собі не активує Google Ads чи GA4.",
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
         ,
            "E-mail для реалізації прав (GDPR): {supportEmail}"
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
            "Необхідні cookie: потрібні для базової роботи сайту (наприклад кошик, вхід/сесія, мова та збереження вибору щодо cookie). Цю категорію не можна вимкнути в налаштуваннях згоди.",
            "Аналітичні cookie/технології: необов’язкові. Допомагають розуміти, як відвідувачі користуються сайтом (наразі зокрема Vercel Analytics). Активуються лише після згоди на категорію «Аналітичні». Google Analytics 4 наразі не активний.",
            "Маркетингові cookie/технології: необов’язкові. Можуть використовуватися для вимірювання реклами, конверсій і пов’язаних рекламних функцій, коли їх увімкнено. Активуються лише після згоди на категорію «Маркетингові». Google Ads і конверсії Google Ads наразі не впроваджені і активно дані не збирають.",
            "Google Tag Manager використовуємо як інструмент керування тегами. Сам Tag Manager не є рекламною послугою; він запускає схвалені вимірювальні та маркетингові теги згідно з вашою згодою."
          ]
        },
        {
          "heading": "Ваш вибір",
          "body": [
            "До вашого вибору аналітика й маркетинг вимкнені; активними залишаються лише необхідні cookie.",
            "Під час першого візиту можна прийняти все, залишити лише необхідні або окремо увімкнути/вимкнути «Аналітичні» та «Маркетингові».",
            "Вибір можна змінити будь-коли на цій сторінці. Збережена згода (cookie ga-cookie-consent) діє приблизно 180 днів, доки ви її не зміните. Рішення щодо згоди фіксуємо для відповідності та аудиту."
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
