import { legalSeedEntry } from './legal-seed-builders'
import type { LegalSeedEntry } from './legal-seed.types'

export const UA_EXTENDED_LEGAL_SEED: LegalSeedEntry[] = [
  legalSeedEntry(
    'TERMS',
    'en',
    "Terms of use",
    "These terms govern purchases at {sellerName} (company ID {ico}, address {legalAddress}) under Ukrainian consumer law. By placing an order you accept them.",
    [
        {
          "heading": "1. General",
          "body": [
            "These Terms govern the relationship between {sellerName} (“Seller”) and customers of the online shop (“Site”).",
            "By placing an order you confirm that you accept these Terms."
          ]
        },
        {
          "heading": "2. Ordering",
          "body": [
            "Orders may be placed via the Site, phone, or email.",
            "After ordering we send a confirmation to your email.",
            "The Seller may refuse an order if goods are unavailable or the customer cannot be contacted."
          ]
        },
        {
          "heading": "3. Prices and payment",
          "body": [
            "Prices are shown in Ukrainian hryvnia and include VAT unless stated otherwise.",
            "Prices may change without notice; the order price is fixed when placed.",
            "Available payment methods are shown at checkout (e.g. card online, bank transfer)."
          ]
        },
        {
          "heading": "4. Delivery",
          "body": [
            "Delivery uses methods available in the cart (e.g. Nova Poshta or pickup — depending on store settings).",
            "Timing depends on the method and region.",
            "Delivery cost follows carrier tariffs and depends on weight and size."
          ]
        },
        {
          "heading": "5. Returns",
          "body": [
            "You may return unused goods of satisfactory quality within 14 days of receipt, subject to rules for live plants.",
            "Plant returns are accepted primarily for transport damage or variety mismatch; claims within 24 hours with photos.",
            "Return shipping is paid by the buyer except for defective goods."
          ]
        },
        {
          "heading": "6. Warranty",
          "body": [
            "The Seller warrants planting material quality at sale.",
            "Warranty excludes post-delivery damage from improper care, weather, or mechanical damage."
          ]
        },
        {
          "heading": "7. Privacy",
          "body": [
            "Personal data is processed under the Privacy Policy and applicable Ukrainian law.",
            "Data is used to fulfil orders and communicate; shared with third parties only as needed for delivery, payment, or accounting."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'PRIVACY',
    'en',
    "Privacy policy",
    "This Privacy policy explains which personal data we process, for what purpose, and what rights you have. Controller: {sellerName}, company ID {ico}, address {legalAddress}. Ukrainian law applies on this deployment.",
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
    'en',
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
            "Necessary cookies power the cart, sign-in/session, language and storing your cookie choice — without them the site will not work correctly. This category cannot be switched off.",
            "Analytics cookies/technologies are optional (currently including Vercel Analytics) and run only after Analytics consent. Google Analytics 4 is not currently active.",
            "Marketing cookies/technologies are optional and may support advertising or conversion measurement when enabled; they run only after Marketing consent. Google Ads is not currently implemented or collecting data.",
            "Google Tag Manager is used as tag management; it is not itself an advertising service."
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
    'en',
    "News and offers",
    "I want to receive marketing emails.",
    [
        {
          "heading": "Scope",
          "body": [
            "Subscribe to our newsletter — separate from order emails. You can withdraw anytime."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'TERMS',
    'sk',
    "Obchodné podmienky",
    "These terms govern purchases at {sellerName} (company ID {ico}, address {legalAddress}) under Ukrainian consumer law. By placing an order you accept them.",
    [
        {
          "heading": "1. Všeobecné ustanovenia",
          "body": [
            "Tieto podmienky upravujú vzťah medzi {sellerName} („Predávajúci“) a kupujúcimi internetového obchodu („Stránka“).",
            "Odoslaním objednávky potvrdzujete súhlas s týmito podmienkami."
          ]
        },
        {
          "heading": "2. Objednávka",
          "body": [
            "Objednávky cez stránku, telefón alebo e-mail.",
            "Po objednávke zasielame potvrdenie na e-mail.",
            "Predávajúci môže objednávku odmietnuť pri nedostupnosti tovaru alebo nemožnosti kontaktovať kupujúceho."
          ]
        },
        {
          "heading": "3. Ceny a platba",
          "body": [
            "Ceny sú v ukrajinských hrivnách a zahŕňajú DPH, ak nie je uvedené inak.",
            "Cena sa fixuje pri odoslaní objednávky.",
            "Dostupné spôsoby platby sú v pokladni (napr. karta online, bankový prevod)."
          ]
        },
        {
          "heading": "4. Doprava",
          "body": [
            "Doprava spôsobmi dostupnými v košíku (napr. Nova Poshta alebo osobný odber — podľa nastavení).",
            "Termíny závisia od spôsobu a regiónu.",
            "Cena dopravy podľa taríf dopravcu a hmotnosti / rozmerov."
          ]
        },
        {
          "heading": "5. Vrátenie",
          "body": [
            "Tovar primeranej kvality možno vrátiť do 14 dní od prevzatia, ak nebol použitý — s ohľadom na živé rastliny.",
            "Pri rastlinách najmä poškodenie prepravou alebo nezhodu odrody; reklamácie do 24 hodín s fotkami.",
            "Náklady na vrátenie znáša kupujúci okrem vád tovaru."
          ]
        },
        {
          "heading": "6. Záruka",
          "body": [
            "Predávajúci garantuje kvalitu sadbového materiálu v čase predaja.",
            "Záruka sa nevzťahuje na poškodenie po prevzatí nesprávnou starostlivosťou alebo počasím."
          ]
        },
        {
          "heading": "7. Ochrana údajov",
          "body": [
            "Osobné údaje sa spracúvajú podľa Politiká ochrany údajov a ukrajinského práva.",
            "Údaje používame na plnenie objednávky; tretím stranám len v nevyhnutnom rozsahu."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'PRIVACY',
    'sk',
    "Ochrana osobných údajov",
    "Tieto Zásady ochrany osobných údajov vysvetľujú, aké osobné údaje spracúvame, na aký účel a aké máte práva. Ide o základnú šablónu, ktorú musí právnik upraviť v súlade s legislatívou SR a EÚ (GDPR).",
    [
        {
          "heading": "1. Prevádzkovateľ osobných údajov",
          "body": [
            "Prevádzkovateľom osobných údajov je predajca záhradníckeho e-shopu (obchodná spoločnosť/živnostník uvedený v sekcii „Kontakty“ a v Obchodných podmienkach).",
            "V otázkach spracovania osobných údajov nás môžete kontaktovať prostredníctvom údajov uvedených na stránke „Kontakty“."
          ]
        },
        {
          "heading": "2. Aké údaje spracúvame",
          "body": [
            "Údaje profilu: meno, priezvisko, telefón, email, doručovacia adresa.",
            "Údaje o objednávkach: obsah objednávky, spôsob a adresa doručenia, spôsob platby, história stavov.",
            "Technické údaje: cookies, údaje o používaní stránky (len ak ste súhlasili s analytickými cookies)."
          ]
        },
        {
          "heading": "3. Účel a právny základ spracovania",
          "body": [
            "Údaje klientov spracúvame na vybavenie a splnenie objednávok a na komunikáciu ohľadom doručenia a podpory — na základe plnenia zmluvy a súhlasu užívateľa.",
            "Analytické cookies používame len na základe samostatného súhlasu, ktorý môžete kedykoľvek odvolať na stránke Zásady používania cookies."
          ]
        },
        {
          "heading": "4. Komu poskytujeme údaje",
          "body": [
            "Údaje môžu byť poskytnuté prepravným spoločnostiam, platobným poskytovateľom a poskytovateľom email/SMS notifikácií — výlučne v rozsahu potrebnom na splnenie objednávky.",
            "Osobné údaje nepredávame tretím stranám."
          ]
        },
        {
          "heading": "5. Doba uchovávania",
          "body": [
            "Údaje profilu uchovávame, kým je účet aktívny. Údaje o objednávkach uchovávame počas doby vyžadovanej pre účtovné a daňové účely.",
            "Účet môžete kedykoľvek zmazať v nastaveniach zákazníckeho účtu — pozri sekciu nižšie."
          ]
        },
        {
          "heading": "6. Vaše práva",
          "body": [
            "Máte právo na prístup k svojim údajom, ich opravu, vymazanie (anonymizáciu), obmedzenie spracovania a namietanie proti spracovaniu.",
            "Kópiu svojich údajov si môžete stiahnuť alebo účet zmazať v zákazníckom účte v sekcii „Nastavenia“ → „Údaje a súkromie“.",
            "Máte tiež právo podať sťažnosť na Úrad na ochranu osobných údajov SR."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'COOKIES',
    'sk',
    "Zásady používania cookies",
    "Táto stránka vysvetľuje, aké cookies stránka používa, na aký účel a ako môžete správu súhlasu meniť.",
    [
        {
          "heading": "Čo sú cookies",
          "body": [
            "Cookies sú malé textové súbory, ktoré sa ukladajú vo vašom prehliadači počas návštevy stránky a pomáhajú jej správne fungovať a pamätať si vaše nastavenia."
          ]
        },
        {
          "heading": "Ako používame cookies",
          "body": [
            "Nevyhnutné cookies zabezpečujú fungovanie košíka, prihlásenia a uložených jazykových/regionálnych nastavení — bez nich stránka nebude fungovať správne.",
            "Analytické cookies/technológie sú voliteľné (momentálne vrátane Vercel Analytics) a spúšťajú sa len po súhlase. Google Analytics 4 momentálne nie je aktívny. Marketingové technológie sú voliteľné a spúšťajú sa len po marketingovom súhlase; Google Ads momentálne nie je implementovaný. Google Tag Manager používame na správu značiek, nie ako reklamu."
          ]
        },
        {
          "heading": "Vaša voľba",
          "body": [
            "Pri prvej návšteve stránky sa zobrazí banner, kde môžete prijať všetky cookies, zachovať len nevyhnutné alebo si kategórie prispôsobiť samostatne.",
            "Svoju voľbu môžete kedykoľvek zmeniť nižšie na tejto stránke."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'MARKETING_CONSENT',
    'sk',
    "Novinky a ponuky",
    "Chcem dostávať marketingové e-maily.",
    [
        {
          "heading": "Scope",
          "body": [
            "Prihláste sa na odber — oddelené od e-mailov o objednávkach. Súhlas môžete kedykoľvek odvolať."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'TERMS',
    'de',
    "Nutzungsbedingungen",
    "These terms govern purchases at {sellerName} (company ID {ico}, address {legalAddress}) under Ukrainian consumer law. By placing an order you accept them.",
    [
        {
          "heading": "1. General",
          "body": [
            "These Terms govern the relationship between {sellerName} (“Seller”) and customers of the online shop (“Site”).",
            "By placing an order you confirm that you accept these Terms."
          ]
        },
        {
          "heading": "2. Ordering",
          "body": [
            "Orders may be placed via the Site, phone, or email.",
            "After ordering we send a confirmation to your email.",
            "The Seller may refuse an order if goods are unavailable or the customer cannot be contacted."
          ]
        },
        {
          "heading": "3. Prices and payment",
          "body": [
            "Prices are shown in Ukrainian hryvnia and include VAT unless stated otherwise.",
            "Prices may change without notice; the order price is fixed when placed.",
            "Available payment methods are shown at checkout (e.g. card online, bank transfer)."
          ]
        },
        {
          "heading": "4. Delivery",
          "body": [
            "Delivery uses methods available in the cart (e.g. Nova Poshta or pickup — depending on store settings).",
            "Timing depends on the method and region.",
            "Delivery cost follows carrier tariffs and depends on weight and size."
          ]
        },
        {
          "heading": "5. Returns",
          "body": [
            "You may return unused goods of satisfactory quality within 14 days of receipt, subject to rules for live plants.",
            "Plant returns are accepted primarily for transport damage or variety mismatch; claims within 24 hours with photos.",
            "Return shipping is paid by the buyer except for defective goods."
          ]
        },
        {
          "heading": "6. Warranty",
          "body": [
            "The Seller warrants planting material quality at sale.",
            "Warranty excludes post-delivery damage from improper care, weather, or mechanical damage."
          ]
        },
        {
          "heading": "7. Privacy",
          "body": [
            "Personal data is processed under the Privacy Policy and applicable Ukrainian law.",
            "Data is used to fulfil orders and communicate; shared with third parties only as needed for delivery, payment, or accounting."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'PRIVACY',
    'de',
    "Datenschutzerklärung",
    "Diese Datenschutzerklärung erläutert, welche personenbezogenen Daten wir verarbeiten, zu welchem Zweck und welche Rechte Sie haben. Dieser Text ist eine Basisvorlage und muss von einem Rechtsanwalt an die Gesetzgebung Ihres Landes angepasst werden.",
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
            "Notwendige Cookies ermöglichen Warenkorb, Anmeldung/Sitzung, Sprache und Speicherung Ihrer Cookie-Wahl — ohne sie funktioniert die Website nicht korrekt. Diese Kategorie kann nicht deaktiviert werden.",
            "Analyse-Cookies/Technologien sind optional (derzeit einschließlich Vercel Analytics) und werden erst nach Analyse-Einwilligung aktiv. Google Analytics 4 ist derzeit nicht aktiv.",
            "Marketing-Cookies/Technologien sind optional und können Werbemessung oder Conversions unterstützen, wenn aktiviert; sie werden erst nach Marketing-Einwilligung aktiv. Google Ads ist derzeit nicht implementiert und erhebt keine Daten.",
            "Google Tag Manager dient dem Tag-Management und ist selbst keine Werbedienstleistung."
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
    "These terms govern purchases at {sellerName} (company ID {ico}, address {legalAddress}) under Ukrainian consumer law. By placing an order you accept them.",
    [
        {
          "heading": "1. General",
          "body": [
            "These Terms govern the relationship between {sellerName} (“Seller”) and customers of the online shop (“Site”).",
            "By placing an order you confirm that you accept these Terms."
          ]
        },
        {
          "heading": "2. Ordering",
          "body": [
            "Orders may be placed via the Site, phone, or email.",
            "After ordering we send a confirmation to your email.",
            "The Seller may refuse an order if goods are unavailable or the customer cannot be contacted."
          ]
        },
        {
          "heading": "3. Prices and payment",
          "body": [
            "Prices are shown in Ukrainian hryvnia and include VAT unless stated otherwise.",
            "Prices may change without notice; the order price is fixed when placed.",
            "Available payment methods are shown at checkout (e.g. card online, bank transfer)."
          ]
        },
        {
          "heading": "4. Delivery",
          "body": [
            "Delivery uses methods available in the cart (e.g. Nova Poshta or pickup — depending on store settings).",
            "Timing depends on the method and region.",
            "Delivery cost follows carrier tariffs and depends on weight and size."
          ]
        },
        {
          "heading": "5. Returns",
          "body": [
            "You may return unused goods of satisfactory quality within 14 days of receipt, subject to rules for live plants.",
            "Plant returns are accepted primarily for transport damage or variety mismatch; claims within 24 hours with photos.",
            "Return shipping is paid by the buyer except for defective goods."
          ]
        },
        {
          "heading": "6. Warranty",
          "body": [
            "The Seller warrants planting material quality at sale.",
            "Warranty excludes post-delivery damage from improper care, weather, or mechanical damage."
          ]
        },
        {
          "heading": "7. Privacy",
          "body": [
            "Personal data is processed under the Privacy Policy and applicable Ukrainian law.",
            "Data is used to fulfil orders and communicate; shared with third parties only as needed for delivery, payment, or accounting."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'PRIVACY',
    'hu',
    "Adatvédelmi irányelvek",
    "Ez az Adatvédelmi irányelv ismerteti, milyen személyes adatokat kezelünk, milyen célból, és milyen jogai vannak. Ez a szöveg alap sablon, és ügyvész általi felülvizsgálat szükséges az ország jogszabályaihoz igazítva.",
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
            "A szükséges sütik működtetik a kosarat, a bejelentkezést/munkamenetet, a nyelvet és a sütihozzájárulás mentését — ezek nélkül az oldal nem működik megfelelően. Ezt a kategóriát nem lehet kikapcsolni.",
            "Az analitikai sütik/technológiák opcionálisak (jelenleg beleértve a Vercel Analytics szolgáltatást), és csak Analitika hozzájárulás után aktívak. A Google Analytics 4 jelenleg nem aktív.",
            "A marketing sütik/technológiák opcionálisak, és hirdetés- vagy konverziómérést támogathatnak, ha be vannak kapcsolva; csak Marketing hozzájárulás után aktívak. A Google Ads jelenleg nincs implementálva, és nem gyűjt adatokat.",
            "A Google Tag Managert címkekezelésre használjuk; önmagában nem hirdetési szolgáltatás."
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
    "These terms govern purchases at {sellerName} (company ID {ico}, address {legalAddress}) under Ukrainian consumer law. By placing an order you accept them.",
    [
        {
          "heading": "1. General",
          "body": [
            "These Terms govern the relationship between {sellerName} (“Seller”) and customers of the online shop (“Site”).",
            "By placing an order you confirm that you accept these Terms."
          ]
        },
        {
          "heading": "2. Ordering",
          "body": [
            "Orders may be placed via the Site, phone, or email.",
            "After ordering we send a confirmation to your email.",
            "The Seller may refuse an order if goods are unavailable or the customer cannot be contacted."
          ]
        },
        {
          "heading": "3. Prices and payment",
          "body": [
            "Prices are shown in Ukrainian hryvnia and include VAT unless stated otherwise.",
            "Prices may change without notice; the order price is fixed when placed.",
            "Available payment methods are shown at checkout (e.g. card online, bank transfer)."
          ]
        },
        {
          "heading": "4. Delivery",
          "body": [
            "Delivery uses methods available in the cart (e.g. Nova Poshta or pickup — depending on store settings).",
            "Timing depends on the method and region.",
            "Delivery cost follows carrier tariffs and depends on weight and size."
          ]
        },
        {
          "heading": "5. Returns",
          "body": [
            "You may return unused goods of satisfactory quality within 14 days of receipt, subject to rules for live plants.",
            "Plant returns are accepted primarily for transport damage or variety mismatch; claims within 24 hours with photos.",
            "Return shipping is paid by the buyer except for defective goods."
          ]
        },
        {
          "heading": "6. Warranty",
          "body": [
            "The Seller warrants planting material quality at sale.",
            "Warranty excludes post-delivery damage from improper care, weather, or mechanical damage."
          ]
        },
        {
          "heading": "7. Privacy",
          "body": [
            "Personal data is processed under the Privacy Policy and applicable Ukrainian law.",
            "Data is used to fulfil orders and communicate; shared with third parties only as needed for delivery, payment, or accounting."
          ]
        }
      ],
  ),
  legalSeedEntry(
    'PRIVACY',
    'cs',
    "Privacy policy",
    "This Privacy policy explains which personal data we process, for what purpose, and what rights you have. Controller: {sellerName}, company ID {ico}, address {legalAddress}. Ukrainian law applies on this deployment.",
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
            "Necessary cookies power the cart, sign-in/session, language and storing your cookie choice — without them the site will not work correctly. This category cannot be switched off.",
            "Analytics cookies/technologies are optional (currently including Vercel Analytics) and run only after Analytics consent. Google Analytics 4 is not currently active.",
            "Marketing cookies/technologies are optional and may support advertising or conversion measurement when enabled; they run only after Marketing consent. Google Ads is not currently implemented or collecting data.",
            "Google Tag Manager is used as tag management; it is not itself an advertising service."
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
]
