import type { LegalSeedEntry } from '../legal-seed.types'

/** First production PRIVACY Version 1 — EU-neutral, same document for all hosts. */
export const PRIVACY_PRODUCTION_V1: LegalSeedEntry[] = [
  {
    type: 'PRIVACY',
    locale: 'sk',
    title: "Podmienky ochrany osobných údajov",
    intro: "Tento dokument obsahuje informácie o spracúvaní osobných údajov podľa nariadenia Európskeho parlamentu a Rady (EÚ) 2016/679 („GDPR“) a príslušných právnych predpisov Slovenskej republiky.\n\nPrevádzkovateľom osobných údajov je {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, so sídlom {legalAddress}.\n\nKontakt pre otázky týkajúce sa ochrany osobných údajov: {supportEmail}.",
    sections: [
      {
        heading: "1. Nákup tovaru a vybavenie objednávky",
        body: [
          "Na prijatie, spracovanie a vybavenie objednávky spracúvame najmä meno a priezvisko, e-mailovú adresu, telefónne číslo, doručovaciu a fakturačnú adresu, údaje o objednanom tovare, platbe a doručení a údaje potrebné na komunikáciu s kupujúcim.",
          "Právnym základom spracúvania je najmä čl. 6 ods. 1 písm. b) GDPR – spracúvanie nevyhnutné na plnenie zmluvy alebo vykonanie opatrení pred uzavretím zmluvy – a čl. 6 ods. 1 písm. c) GDPR v prípadoch, keď je spracúvanie potrebné na splnenie zákonnej povinnosti, najmä v oblasti účtovníctva a daní.",
          "Bez údajov nevyhnutných na uzavretie a plnenie zmluvy nie je možné objednávku riadne spracovať a doručiť.",
          "Údaje súvisiace s objednávkou uchovávame počas doby potrebnej na splnenie zmluvy a následne počas lehôt vyplývajúcich z príslušných účtovných, daňových a iných právnych predpisov. Niektoré doklady sa môžu uchovávať spravidla až 10 rokov, ak to vyžaduje príslušný právny predpis.",
        ],
      },
      {
        heading: "2. Zákaznícky účet",
        body: [
          "Ak si zákazník vytvorí alebo používa zákaznícky účet, spracúvame identifikačné a kontaktné údaje, údaje potrebné na prihlásenie alebo overenie a históriu objednávok a ďalších úkonov viazaných na účet.",
          "Právnym základom je čl. 6 ods. 1 písm. b) GDPR – plnenie zmluvy o vedení zákazníckeho účtu alebo vykonanie opatrení na žiadosť zákazníka.",
          "Údaje viazané výlučne na zákaznícky účet uchovávame počas existencie účtu. Zrušením účtu nie je dotknuté ďalšie uchovávanie údajov, ktoré sme povinní uchovávať podľa zákona alebo ktoré sú potrebné na ochranu a uplatnenie právnych nárokov.",
        ],
      },
      {
        heading: "3. Zákonné povinnosti a oprávnené záujmy",
        body: [
          "Osobné údaje môžeme spracúvať aj na účely plnenia zákonných povinností, ochrany a uplatňovania právnych nárokov, predchádzania podvodom, bezpečnosti služieb a spolupráce s oprávnenými orgánmi verejnej moci.",
          "Právnym základom môže byť podľa konkrétneho účelu čl. 6 ods. 1 písm. c) GDPR – splnenie zákonnej povinnosti – alebo čl. 6 ods. 1 písm. f) GDPR – oprávnený záujem prevádzkovateľa alebo tretej strany.",
          "Pri spracúvaní založenom na oprávnenom záujme posudzujeme, či nad týmto záujmom neprevažujú práva a slobody dotknutej osoby.",
        ],
      },
      {
        heading: "4. Príjemcovia a sprostredkovatelia",
        body: [
          "Osobné údaje môžu byť v nevyhnutnom rozsahu poskytované alebo sprístupnené najmä týmto kategóriám príjemcov a sprostredkovateľov:",
          "- poskytovateľom prepravných, kuriérskych a doručovacích služieb;",
          "- poskytovateľom platobných služieb a platobných brán;",
          "- poskytovateľom IT infraštruktúry, hostingu, cloudových a e-mailových služieb;",
          "- účtovným, daňovým a právnym poradcom;",
          "- poskytovateľom technických, analytických alebo marketingových služieb, ak sú tieto služby používané v súlade s vašimi nastaveniami súhlasu a platnými právnymi predpismi;",
          "- orgánom verejnej moci, ak to vyžaduje zákon.",
          "Údaje platobných kariet priamo nespracúvame, ak ich kupujúci zadáva priamo v prostredí príslušného poskytovateľa platobných služieb.",
          "Osobné údaje nepredávame tretím stranám.",
          "Ak pri využívaní konkrétnej služby dochádza k prenosu osobných údajov mimo Európskeho hospodárskeho priestoru, prenos sa uskutočňuje iba v súlade s GDPR, najmä na základe rozhodnutia o primeranosti alebo vhodných záruk, ako sú štandardné zmluvné doložky, ak sú potrebné.",
        ],
      },
      {
        heading: "5. Marketing, analytika a cookies",
        body: [
          "Obchodné oznámenia zasielame iba na základe príslušného právneho titulu a v rozsahu povolenom platnými právnymi predpismi. Ak je spracúvanie založené na súhlase, súhlas možno kedykoľvek odvolať. Ak právne predpisy umožňujú zasielanie obchodných oznámení existujúcim zákazníkom bez samostatného súhlasu, zákazník má vždy možnosť jednoduchým spôsobom odmietnuť ďalšie zasielanie.",
          "Na webovej stránke používame technológie nevyhnutné na fungovanie internetového obchodu. Voliteľné analytické a marketingové technológie používame iba v súlade s vaším nastavením súhlasu a platnými právnymi predpismi.",
          "Na správu technických, analytických a marketingových značiek môžeme používať Google Tag Manager. Google Tag Manager slúži najmä na technickú správu značiek; konkrétne spracúvanie osobných údajov závisí od služieb a značiek, ktoré sú prostredníctvom neho aktivované.",
          "Konkrétne analytické a marketingové služby, ktoré sa aktuálne používajú, ich účel, právny základ, používané cookies alebo obdobné technológie a možnosti zmeny súhlasu sú uvedené v [[cookies|Politike cookies]] a v nastaveniach cookies.",
          "Ak to vyžadujú právne predpisy alebo pravidlá používaných služieb, analytické a reklamné značky sa aktivujú až po príslušnom súhlase používateľa.",
          "Prostredníctvom analytických a marketingových služieb môžu byť spracúvané najmä technické údaje o zariadení a prehliadači, údaje o interakcii s webovou stránkou a informácie o stave súhlasu. Do analytických alebo reklamných značiek zámerne neposielame meno, poštovú adresu, telefónne číslo ani e-mailovú adresu, pokiaľ na to neexistuje osobitný právny základ a príslušné nastavenie služby.",
          "Svoj súhlas s voliteľnými analytickými alebo marketingovými technológiami môžete kedykoľvek zmeniť alebo odvolať prostredníctvom nastavení cookies.",
        ],
      },
      {
        heading: "6. Doba uchovávania údajov",
        body: [
          "Osobné údaje uchovávame iba po dobu potrebnú na účel, na ktorý boli získané, alebo po dobu vyžadovanú príslušnými právnymi predpismi.",
          "Konkrétna doba uchovávania závisí od účelu spracúvania. Údaje súvisiace s účtovníctvom a daňovými povinnosťami sa uchovávajú počas zákonom stanovenej doby. Údaje potrebné na ochranu právnych nárokov môžu byť uchovávané po dobu trvania príslušných premlčacích lehôt.",
          "Po uplynutí príslušnej doby údaje vymažeme alebo anonymizujeme, pokiaľ neexistuje iný zákonný dôvod na ich ďalšie uchovávanie.",
        ],
      },
      {
        heading: "7. Vaše práva",
        body: [
          "Za podmienok stanovených GDPR máte právo najmä:",
          "- na prístup k svojim osobným údajom;",
          "- na opravu nesprávnych alebo neúplných údajov;",
          "- na vymazanie osobných údajov;",
          "- na obmedzenie spracúvania;",
          "- na prenosnosť údajov;",
          "- namietať proti spracúvaniu založenému na oprávnenom záujme;",
          "- kedykoľvek odvolať súhlas, ak je spracúvanie založené na súhlase.",
          "Odvolanie súhlasu nemá vplyv na zákonnosť spracúvania vykonaného pred jeho odvolaním.",
          "Svoje práva môžete uplatniť e-mailom na {supportEmail} alebo prostredníctvom ďalších kontaktných údajov prevádzkovateľa uvedených na stránke [[contacts|Kontakty]].",
          "Máte tiež právo podať sťažnosť príslušnému dozornému orgánu na ochranu osobných údajov. Prevádzkovateľ so sídlom v Slovenskej republike podlieha dozoru Úradu na ochranu osobných údajov Slovenskej republiky. Ak máte obvyklý pobyt alebo miesto výkonu práce v inom členskom štáte EÚ, môžete sa za podmienok GDPR obrátiť aj na príslušný dozorný orgán v tomto členskom štáte.",
        ],
      },
      {
        heading: "8. Automatizované rozhodovanie",
        body: [
          "Pri bežnom nákupe v internetovom obchode nevykonávame rozhodovanie založené výlučne na automatizovanom spracúvaní, ktoré by voči vám malo právne účinky alebo vás obdobne významne ovplyvňovalo, pokiaľ nie je pri konkrétnej službe uvedené inak.",
        ],
      },
      {
        heading: "9. Záverečné informácie",
        body: [
          "Aktuálna verzia tohto dokumentu je zverejnená na tejto stránke spolu s číslom a dátumom revízie.",
          "Ak tento dokument tvoril súčasť informácií poskytnutých pri objednávke alebo pri udelení súhlasu, príslušná verzia sa posudzuje podľa znenia platného v danom čase.",
        ],
      },
    ],
  },
  {
    type: 'PRIVACY',
    locale: 'en',
    title: "Privacy Policy",
    intro: "This document provides information on the processing of personal data in accordance with Regulation (EU) 2016/679 of the European Parliament and of the Council (“GDPR”) and the applicable laws of the Slovak Republic.\n\nThe controller of personal data is {sellerName}, Company ID No. {ico}, Tax ID No. {dic}, VAT ID No. {icDph}, with its registered office at {legalAddress}.\n\nContact for questions concerning personal data protection: {supportEmail}.",
    sections: [
      {
        heading: "1. Purchase of goods and order processing",
        body: [
          "For the acceptance, processing and fulfilment of an order, we process in particular the customer's first and last name, email address, telephone number, delivery and billing address, information about the goods ordered, payment and delivery, and information necessary for communication with the customer.",
          "The legal basis for processing is primarily Article 6(1)(b) GDPR – processing necessary for the performance of a contract or in order to take steps prior to entering into a contract – and Article 6(1)(c) GDPR where processing is necessary for compliance with a legal obligation, in particular accounting and tax obligations.",
          "Without the information necessary to enter into and perform the contract, we cannot properly process and deliver the order.",
          "We retain data relating to an order for the period necessary to perform the contract and subsequently for the periods required by applicable accounting, tax and other legislation. Certain documents may generally be retained for up to 10 years where required by applicable law.",
        ],
      },
      {
        heading: "2. Customer account",
        body: [
          "If a customer creates or uses a customer account, we process identification and contact information, information necessary for login or verification, and the history of orders and other activities associated with the account.",
          "The legal basis is Article 6(1)(b) GDPR – performance of the agreement concerning the customer account or taking steps at the customer's request.",
          "Data relating exclusively to the customer account is retained for as long as the account exists. Closing an account does not affect the further retention of information that we are legally required to retain or that is necessary for the establishment, exercise or defence of legal claims.",
        ],
      },
      {
        heading: "3. Legal obligations and legitimate interests",
        body: [
          "We may also process personal data for compliance with legal obligations, the establishment, exercise or defence of legal claims, fraud prevention, service security and cooperation with authorised public authorities.",
          "Depending on the particular purpose, the legal basis may be Article 6(1)(c) GDPR – compliance with a legal obligation – or Article 6(1)(f) GDPR – the legitimate interests pursued by the controller or a third party.",
          "Where processing is based on a legitimate interest, we assess whether that interest is overridden by the rights and freedoms of the data subject.",
        ],
      },
      {
        heading: "4. Recipients and processors",
        body: [
          "To the extent necessary, personal data may be disclosed or made available in particular to the following categories of recipients and processors:",
          "- transport, courier and delivery service providers;",
          "- payment service providers and payment gateways;",
          "- IT infrastructure, hosting, cloud and email service providers;",
          "- accounting, tax and legal advisers;",
          "- technical, analytics or marketing service providers where such services are used in accordance with your consent settings and applicable law;",
          "- public authorities where required by law.",
          "We do not directly process payment card details where the customer enters them directly in the environment of the relevant payment service provider.",
          "We do not sell personal data to third parties.",
          "Where the use of a particular service involves a transfer of personal data outside the European Economic Area, such transfer is carried out only in accordance with the GDPR, in particular on the basis of an adequacy decision or appropriate safeguards such as Standard Contractual Clauses, where required.",
        ],
      },
      {
        heading: "5. Marketing, analytics and cookies",
        body: [
          "We send marketing communications only where there is an appropriate legal basis and to the extent permitted by applicable law. Where processing is based on consent, consent may be withdrawn at any time. Where applicable law permits marketing communications to existing customers without separate consent, the customer is always provided with a simple means of opting out of further communications.",
          "We use technologies necessary for the operation of the online store. Optional analytics and marketing technologies are used only in accordance with your consent settings and applicable law.",
          "We may use Google Tag Manager to manage technical, analytics and marketing tags. Google Tag Manager is primarily used for the technical management of tags; the specific processing of personal data depends on the services and tags activated through it.",
          "The analytics and marketing services currently in use, their purposes, legal bases, cookies or similar technologies used and options for changing consent are described in our [[cookies|Cookie Policy]] and cookie settings.",
          "Where required by applicable law or the rules of the services concerned, analytics and advertising tags are activated only after the relevant consent has been given.",
          "Analytics and marketing services may process, in particular, technical information about the device and browser, information about interactions with the website and information concerning consent status. We do not intentionally send a person's name, postal address, telephone number or email address to analytics or advertising tags unless there is a specific legal basis and an appropriate configuration of the relevant service.",
          "You may change or withdraw your consent to optional analytics or marketing technologies at any time through the cookie settings.",
        ],
      },
      {
        heading: "6. Data retention",
        body: [
          "We retain personal data only for as long as necessary for the purpose for which it was collected or for the period required by applicable law.",
          "The specific retention period depends on the purpose of processing. Information relating to accounting and tax obligations is retained for the period prescribed by law. Information necessary for the establishment, exercise or defence of legal claims may be retained for the duration of the applicable limitation periods.",
          "After the relevant retention period expires, the data is deleted or anonymised unless another lawful basis exists for its continued retention.",
        ],
      },
      {
        heading: "7. Your rights",
        body: [
          "Subject to the conditions laid down in the GDPR, you have in particular the right:",
          "- to access your personal data;",
          "- to rectify inaccurate or incomplete data;",
          "- to erasure of personal data;",
          "- to restriction of processing;",
          "- to data portability;",
          "- to object to processing based on legitimate interests;",
          "- to withdraw consent at any time where processing is based on consent.",
          "Withdrawal of consent does not affect the lawfulness of processing carried out before its withdrawal.",
          "You may exercise your rights by email at {supportEmail} or through the other contact details of the controller provided on the [[contacts|Contact]] page.",
          "You also have the right to lodge a complaint with the competent data protection supervisory authority. The controller established in the Slovak Republic is subject to the supervision of the Office for Personal Data Protection of the Slovak Republic. If your habitual residence or place of work is in another EU Member State, you may also contact the competent supervisory authority in that Member State in accordance with the GDPR.",
        ],
      },
      {
        heading: "8. Automated decision-making",
        body: [
          "In connection with ordinary purchases from the online store, we do not carry out decision-making based solely on automated processing that produces legal effects concerning you or similarly significantly affects you, unless otherwise stated for a particular service.",
        ],
      },
      {
        heading: "9. Final information",
        body: [
          "The current version of this document is published on this page together with its revision number and revision date.",
          "Where this document formed part of the information provided in connection with an order or consent, the applicable version is determined by the wording in force at the relevant time.",
        ],
      },
    ],
  },
  {
    type: 'PRIVACY',
    locale: 'hu',
    title: "Adatvédelmi tájékoztató",
    intro: "Ez a dokumentum az Európai Parlament és a Tanács (EU) 2016/679 rendelete („GDPR”), valamint a Szlovák Köztársaság alkalmazandó jogszabályai alapján tájékoztatást nyújt a személyes adatok kezeléséről.\n\nA személyes adatok adatkezelője: {sellerName}, cégazonosító (IČO): {ico}, adóazonosító (DIČ): {dic}, közösségi adószám (IČ DPH): {icDph}, székhely: {legalAddress}.\n\nAdatvédelmi kérdésekkel kapcsolatos elérhetőség: {supportEmail}.",
    sections: [
      {
        heading: "1. Termékvásárlás és a megrendelés teljesítése",
        body: [
          "A megrendelés fogadása, feldolgozása és teljesítése érdekében különösen a vásárló vezeték- és keresztnevét, e-mail-címét, telefonszámát, szállítási és számlázási címét, a megrendelt termékekre, a fizetésre és a kézbesítésre vonatkozó adatokat, valamint a vásárlóval történő kommunikációhoz szükséges adatokat kezeljük.",
          "Az adatkezelés jogalapja elsősorban a GDPR 6. cikk (1) bekezdés b) pontja – a szerződés teljesítéséhez vagy a szerződés megkötését megelőző lépések megtételéhez szükséges adatkezelés –, valamint a GDPR 6. cikk (1) bekezdés c) pontja, amennyiben az adatkezelés jogi kötelezettség teljesítéséhez, különösen számviteli vagy adózási kötelezettségek teljesítéséhez szükséges.",
          "A szerződés megkötéséhez és teljesítéséhez szükséges adatok nélkül a megrendelést nem tudjuk megfelelően feldolgozni és kézbesíteni.",
          "A megrendeléssel kapcsolatos adatokat a szerződés teljesítéséhez szükséges ideig, ezt követően pedig az alkalmazandó számviteli, adózási és egyéb jogszabályokban meghatározott ideig őrizzük meg. Egyes dokumentumokat az alkalmazandó jogszabályok alapján általában akár 10 évig is meg kell őrizni.",
        ],
      },
      {
        heading: "2. Vásárlói fiók",
        body: [
          "Ha a vásárló vásárlói fiókot hoz létre vagy használ, kezeljük az azonosító és kapcsolattartási adatokat, a bejelentkezéshez vagy ellenőrzéshez szükséges adatokat, valamint a fiókhoz kapcsolódó megrendelések és egyéb műveletek előzményeit.",
          "Az adatkezelés jogalapja a GDPR 6. cikk (1) bekezdés b) pontja – a vásárlói fiók vezetésére vonatkozó szerződés teljesítése vagy a vásárló kérésére történő lépések megtétele.",
          "A kizárólag a vásárlói fiókhoz kapcsolódó adatokat a fiók fennállásának idejéig őrizzük meg. A fiók megszüntetése nem érinti azoknak az adatoknak a további megőrzését, amelyeket jogszabály alapján kötelesek vagyunk megőrizni, illetve amelyek jogi igények előterjesztéséhez, érvényesítéséhez vagy védelméhez szükségesek.",
        ],
      },
      {
        heading: "3. Jogi kötelezettségek és jogos érdekek",
        body: [
          "Személyes adatokat kezelhetünk jogi kötelezettségeink teljesítése, jogi igények előterjesztése, érvényesítése vagy védelme, csalás megelőzése, szolgáltatásaink biztonsága, valamint az arra jogosult hatóságokkal való együttműködés céljából is.",
          "Az adatkezelés jogalapja az adott céltól függően a GDPR 6. cikk (1) bekezdés c) pontja – jogi kötelezettség teljesítése – vagy a GDPR 6. cikk (1) bekezdés f) pontja – az adatkezelő vagy harmadik fél jogos érdeke – lehet.",
          "Jogos érdeken alapuló adatkezelés esetén megvizsgáljuk, hogy az érintett jogai és szabadságai nem élveznek-e elsőbbséget e jogos érdekkel szemben.",
        ],
      },
      {
        heading: "4. Címzettek és adatfeldolgozók",
        body: [
          "A szükséges mértékben a személyes adatok különösen az alábbi címzetti és adatfeldolgozói kategóriák részére adhatók át vagy tehetők hozzáférhetővé:",
          "- szállítási, futár- és kézbesítési szolgáltatók;",
          "- pénzforgalmi szolgáltatók és fizetési szolgáltatók;",
          "- IT-infrastruktúra-, tárhely-, felhő- és e-mail-szolgáltatók;",
          "- számviteli, adó- és jogi tanácsadók;",
          "- technikai, analitikai vagy marketing szolgáltatók, amennyiben szolgáltatásaikat az Ön hozzájárulási beállításaival és az alkalmazandó jogszabályokkal összhangban használjuk;",
          "- hatóságok, ha ezt jogszabály előírja.",
          "A bankkártya adatait nem kezeljük közvetlenül, ha a vásárló azokat közvetlenül az adott pénzforgalmi szolgáltató rendszerében adja meg.",
          "Személyes adatokat harmadik feleknek nem értékesítünk.",
          "Amennyiben egy adott szolgáltatás használata során személyes adatok továbbítására kerül sor az Európai Gazdasági Térségen kívülre, az adattovábbítás kizárólag a GDPR rendelkezéseivel összhangban történik, különösen megfelelőségi határozat vagy megfelelő garanciák, például szükség esetén általános szerződési feltételek alkalmazásával.",
        ],
      },
      {
        heading: "5. Marketing, analitika és cookie-k",
        body: [
          "Marketingcélú üzeneteket kizárólag megfelelő jogalap alapján és az alkalmazandó jogszabályok által megengedett mértékben küldünk. Ha az adatkezelés hozzájáruláson alapul, a hozzájárulás bármikor visszavonható. Ha az alkalmazandó jogszabályok külön hozzájárulás nélkül is lehetővé teszik marketingüzenetek küldését meglévő vásárlóknak, a vásárló számára minden esetben egyszerű lehetőséget biztosítunk a további üzenetek lemondására.",
          "A webáruház működéséhez szükséges technológiákat használunk. Az opcionális analitikai és marketingtechnológiákat kizárólag az Ön hozzájárulási beállításaival és az alkalmazandó jogszabályokkal összhangban használjuk.",
          "A technikai, analitikai és marketingcímkék kezelésére Google Tag Managert használhatunk. A Google Tag Manager elsősorban a címkék technikai kezelésére szolgál; a személyes adatok konkrét kezelése az azon keresztül aktivált szolgáltatásoktól és címkéktől függ.",
          "Az aktuálisan használt analitikai és marketingszolgáltatásokat, azok célját, jogalapját, az alkalmazott cookie-kat vagy hasonló technológiákat, valamint a hozzájárulás módosításának lehetőségeit a [[cookies|Cookie-szabályzat]] és a cookie-beállítások tartalmazzák.",
          "Amennyiben azt az alkalmazandó jogszabályok vagy az adott szolgáltatás szabályai megkövetelik, az analitikai és hirdetési címkéket csak a megfelelő hozzájárulás megadását követően aktiváljuk.",
          "Az analitikai és marketingszolgáltatások különösen az eszközre és a böngészőre vonatkozó technikai adatokat, a weboldallal való interakcióra vonatkozó adatokat és a hozzájárulás állapotára vonatkozó információkat kezelhetnek. Szándékosan nem továbbítunk nevet, postai címet, telefonszámot vagy e-mail-címet analitikai vagy hirdetési címkéknek, kivéve, ha erre külön jogalap és a szolgáltatás megfelelő beállítása áll rendelkezésre.",
          "Az opcionális analitikai vagy marketingtechnológiákhoz adott hozzájárulását bármikor módosíthatja vagy visszavonhatja a cookie-beállításokban.",
        ],
      },
      {
        heading: "6. Adatmegőrzés",
        body: [
          "A személyes adatokat csak addig őrizzük meg, ameddig az adatgyűjtés céljához szükséges, illetve ameddig azt az alkalmazandó jogszabályok előírják.",
          "A konkrét megőrzési idő az adatkezelés céljától függ. A számviteli és adózási kötelezettségekkel kapcsolatos adatokat a jogszabályban meghatározott ideig őrizzük meg. A jogi igények előterjesztéséhez, érvényesítéséhez vagy védelméhez szükséges adatokat az alkalmazandó elévülési idő alatt őrizhetjük meg.",
          "A vonatkozó megőrzési idő lejártát követően az adatokat töröljük vagy anonimizáljuk, kivéve, ha további megőrzésükre más jogszerű jogalap áll fenn.",
        ],
      },
      {
        heading: "7. Az Ön jogai",
        body: [
          "A GDPR-ban meghatározott feltételek mellett Ön különösen jogosult:",
          "- hozzáférni személyes adataihoz;",
          "- kérni a pontatlan vagy hiányos adatok helyesbítését;",
          "- kérni személyes adatainak törlését;",
          "- kérni az adatkezelés korlátozását;",
          "- az adathordozhatósághoz;",
          "- tiltakozni a jogos érdeken alapuló adatkezelés ellen;",
          "- hozzájárulását bármikor visszavonni, ha az adatkezelés hozzájáruláson alapul.",
          "A hozzájárulás visszavonása nem érinti a visszavonást megelőző adatkezelés jogszerűségét.",
          "Jogait a {supportEmail} e-mail-címen vagy az adatkezelő [[contacts|Kapcsolat]] oldalon feltüntetett további elérhetőségein keresztül gyakorolhatja.",
          "Ön jogosult panaszt tenni az illetékes adatvédelmi felügyeleti hatóságnál is. A Szlovák Köztársaságban letelepedett adatkezelő a Szlovák Köztársaság Személyes Adatvédelmi Hivatalának felügyelete alá tartozik. Ha szokásos tartózkodási helye vagy munkahelye egy másik EU-tagállamban található, a GDPR-ban meghatározott feltételek mellett az adott tagállam illetékes felügyeleti hatóságához is fordulhat.",
        ],
      },
      {
        heading: "8. Automatizált döntéshozatal",
        body: [
          "A webáruházban történő szokásos vásárlásokkal kapcsolatban nem alkalmazunk kizárólag automatizált adatkezelésen alapuló olyan döntéshozatalt, amely Önre nézve joghatással járna vagy Önt hasonlóképpen jelentős mértékben érintené, kivéve, ha egy adott szolgáltatásnál ettől eltérő tájékoztatást adunk.",
        ],
      },
      {
        heading: "9. Záró rendelkezések",
        body: [
          "A dokumentum aktuális változata ezen az oldalon, a verziószámmal és a felülvizsgálat dátumával együtt kerül közzétételre.",
          "Ha ez a dokumentum a megrendeléssel vagy a hozzájárulás megadásával kapcsolatban nyújtott tájékoztatás részét képezte, az alkalmazandó változatot az adott időpontban hatályos szöveg alapján kell meghatározni.",
        ],
      },
    ],
  },
  {
    type: 'PRIVACY',
    locale: 'de',
    title: "Datenschutzerklärung",
    intro: "Dieses Dokument informiert über die Verarbeitung personenbezogener Daten gemäß der Verordnung (EU) 2016/679 des Europäischen Parlaments und des Rates („DSGVO“) sowie den anwendbaren Rechtsvorschriften der Slowakischen Republik.\n\nVerantwortlicher für die Verarbeitung personenbezogener Daten ist {sellerName}, Unternehmens-ID (IČO) {ico}, Steuer-ID (DIČ) {dic}, USt-IdNr. (IČ DPH) {icDph}, mit Sitz unter {legalAddress}.\n\nKontakt für Fragen zum Datenschutz: {supportEmail}.",
    sections: [
      {
        heading: "1. Warenkauf und Bestellabwicklung",
        body: [
          "Zur Entgegennahme, Bearbeitung und Erfüllung einer Bestellung verarbeiten wir insbesondere Vor- und Nachname, E-Mail-Adresse, Telefonnummer, Liefer- und Rechnungsadresse, Angaben zu den bestellten Waren, zur Zahlung und Lieferung sowie Daten, die für die Kommunikation mit dem Kunden erforderlich sind.",
          "Rechtsgrundlage ist insbesondere Art. 6 Abs. 1 lit. b DSGVO – die Verarbeitung zur Erfüllung eines Vertrags oder zur Durchführung vorvertraglicher Maßnahmen – sowie Art. 6 Abs. 1 lit. c DSGVO, soweit die Verarbeitung zur Erfüllung einer rechtlichen Verpflichtung, insbesondere im Bereich Buchhaltung und Steuern, erforderlich ist.",
          "Ohne die für den Abschluss und die Erfüllung des Vertrags erforderlichen Daten können wir die Bestellung nicht ordnungsgemäß bearbeiten und liefern.",
          "Bestellbezogene Daten speichern wir für die zur Vertragserfüllung erforderliche Dauer und anschließend für die nach den anwendbaren Buchhaltungs-, Steuer- und sonstigen Rechtsvorschriften vorgeschriebenen Fristen. Bestimmte Unterlagen können, sofern gesetzlich vorgeschrieben, grundsätzlich bis zu 10 Jahre aufbewahrt werden.",
        ],
      },
      {
        heading: "2. Kundenkonto",
        body: [
          "Wenn ein Kunde ein Kundenkonto erstellt oder nutzt, verarbeiten wir Identifikations- und Kontaktdaten, für die Anmeldung oder Verifizierung erforderliche Daten sowie die mit dem Konto verbundene Bestellhistorie und weitere Vorgänge.",
          "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO – die Erfüllung der Vereinbarung über die Führung des Kundenkontos oder die Durchführung von Maßnahmen auf Wunsch des Kunden.",
          "Daten, die ausschließlich mit dem Kundenkonto verbunden sind, speichern wir für die Dauer des Bestehens des Kontos. Die Schließung des Kontos berührt nicht die weitere Speicherung von Daten, zu deren Aufbewahrung wir gesetzlich verpflichtet sind oder die zur Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen erforderlich sind.",
        ],
      },
      {
        heading: "3. Rechtliche Verpflichtungen und berechtigte Interessen",
        body: [
          "Wir können personenbezogene Daten auch zur Erfüllung rechtlicher Verpflichtungen, zur Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen, zur Betrugsprävention, zur Sicherheit unserer Dienste und zur Zusammenarbeit mit zuständigen Behörden verarbeiten.",
          "Je nach Zweck kann die Rechtsgrundlage Art. 6 Abs. 1 lit. c DSGVO – Erfüllung einer rechtlichen Verpflichtung – oder Art. 6 Abs. 1 lit. f DSGVO – berechtigte Interessen des Verantwortlichen oder eines Dritten – sein.",
          "Bei einer Verarbeitung auf Grundlage berechtigter Interessen prüfen wir, ob die Rechte und Freiheiten der betroffenen Person diese Interessen überwiegen.",
        ],
      },
      {
        heading: "4. Empfänger und Auftragsverarbeiter",
        body: [
          "Personenbezogene Daten können im erforderlichen Umfang insbesondere folgenden Kategorien von Empfängern und Auftragsverarbeitern offengelegt oder zugänglich gemacht werden:",
          "- Transport-, Kurier- und Zustelldienstleistern;",
          "- Zahlungsdienstleistern und Zahlungs-Gateways;",
          "- Anbietern von IT-Infrastruktur, Hosting-, Cloud- und E-Mail-Diensten;",
          "- Buchhaltungs-, Steuer- und Rechtsberatern;",
          "- Anbietern technischer, analytischer oder marketingbezogener Dienstleistungen, sofern diese Dienste entsprechend Ihren Einwilligungseinstellungen und den geltenden Rechtsvorschriften eingesetzt werden;",
          "- Behörden, soweit dies gesetzlich vorgeschrieben ist.",
          "Zahlungskartendaten verarbeiten wir nicht unmittelbar, wenn der Kunde diese direkt in der Umgebung des jeweiligen Zahlungsdienstleisters eingibt.",
          "Wir verkaufen personenbezogene Daten nicht an Dritte.",
          "Soweit bei der Nutzung eines bestimmten Dienstes personenbezogene Daten außerhalb des Europäischen Wirtschaftsraums übermittelt werden, erfolgt eine solche Übermittlung ausschließlich im Einklang mit der DSGVO, insbesondere auf Grundlage eines Angemessenheitsbeschlusses oder geeigneter Garantien wie Standardvertragsklauseln, soweit diese erforderlich sind.",
        ],
      },
      {
        heading: "5. Marketing, Analyse und Cookies",
        body: [
          "Marketingmitteilungen versenden wir nur auf einer geeigneten Rechtsgrundlage und im gesetzlich zulässigen Umfang. Beruht die Verarbeitung auf einer Einwilligung, kann diese jederzeit widerrufen werden. Soweit das anwendbare Recht Marketingmitteilungen an bestehende Kunden ohne gesonderte Einwilligung erlaubt, wird dem Kunden stets eine einfache Möglichkeit eingeräumt, weiteren Mitteilungen zu widersprechen.",
          "Wir verwenden Technologien, die für den Betrieb des Online-Shops erforderlich sind. Optionale Analyse- und Marketingtechnologien setzen wir nur entsprechend Ihren Einwilligungseinstellungen und den geltenden Rechtsvorschriften ein.",
          "Zur Verwaltung technischer, analytischer und marketingbezogener Tags können wir Google Tag Manager verwenden. Google Tag Manager dient in erster Linie der technischen Verwaltung von Tags; die konkrete Verarbeitung personenbezogener Daten hängt von den darüber aktivierten Diensten und Tags ab.",
          "Die aktuell eingesetzten Analyse- und Marketingdienste, deren Zwecke und Rechtsgrundlagen, die verwendeten Cookies oder vergleichbaren Technologien sowie die Möglichkeiten zur Änderung Ihrer Einwilligung werden in unserer [[cookies|Cookie-Richtlinie]] und in den Cookie-Einstellungen beschrieben.",
          "Soweit dies gesetzlich oder nach den Regeln des jeweiligen Dienstes erforderlich ist, werden Analyse- und Werbe-Tags erst nach Erteilung der entsprechenden Einwilligung aktiviert.",
          "Im Rahmen von Analyse- und Marketingdiensten können insbesondere technische Informationen über Gerät und Browser, Informationen über Interaktionen mit der Website sowie Informationen über den Einwilligungsstatus verarbeitet werden. Wir übermitteln Namen, Postanschrift, Telefonnummer oder E-Mail-Adresse nicht absichtlich an Analyse- oder Werbe-Tags, sofern hierfür keine besondere Rechtsgrundlage und entsprechende Konfiguration des jeweiligen Dienstes besteht.",
          "Ihre Einwilligung in optionale Analyse- oder Marketingtechnologien können Sie jederzeit über die Cookie-Einstellungen ändern oder widerrufen.",
        ],
      },
      {
        heading: "6. Speicherdauer",
        body: [
          "Wir speichern personenbezogene Daten nur so lange, wie dies für den Zweck erforderlich ist, für den sie erhoben wurden, oder wie es die anwendbaren Rechtsvorschriften verlangen.",
          "Die konkrete Speicherdauer hängt vom jeweiligen Verarbeitungszweck ab. Daten im Zusammenhang mit Buchhaltungs- und Steuerpflichten werden für die gesetzlich vorgeschriebene Dauer aufbewahrt. Daten, die zur Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen erforderlich sind, können während der anwendbaren Verjährungsfristen gespeichert werden.",
          "Nach Ablauf der jeweiligen Aufbewahrungsfrist werden die Daten gelöscht oder anonymisiert, sofern keine andere Rechtsgrundlage für ihre weitere Speicherung besteht.",
        ],
      },
      {
        heading: "7. Ihre Rechte",
        body: [
          "Unter den Voraussetzungen der DSGVO haben Sie insbesondere das Recht:",
          "- auf Auskunft über Ihre personenbezogenen Daten;",
          "- auf Berichtigung unrichtiger oder unvollständiger Daten;",
          "- auf Löschung personenbezogener Daten;",
          "- auf Einschränkung der Verarbeitung;",
          "- auf Datenübertragbarkeit;",
          "- der Verarbeitung auf Grundlage berechtigter Interessen zu widersprechen;",
          "- eine Einwilligung jederzeit zu widerrufen, sofern die Verarbeitung auf einer Einwilligung beruht.",
          "Der Widerruf einer Einwilligung berührt nicht die Rechtmäßigkeit der Verarbeitung vor dem Widerruf.",
          "Sie können Ihre Rechte per E-Mail an {supportEmail} oder über die weiteren auf der Seite [[contacts|Kontakt]] angegebenen Kontaktdaten des Verantwortlichen ausüben.",
          "Sie haben außerdem das Recht, Beschwerde bei der zuständigen Datenschutzaufsichtsbehörde einzulegen. Der in der Slowakischen Republik niedergelassene Verantwortliche unterliegt der Aufsicht des Amtes für den Schutz personenbezogener Daten der Slowakischen Republik. Wenn sich Ihr gewöhnlicher Aufenthaltsort oder Arbeitsplatz in einem anderen EU-Mitgliedstaat befindet, können Sie sich nach Maßgabe der DSGVO auch an die zuständige Aufsichtsbehörde dieses Mitgliedstaats wenden.",
        ],
      },
      {
        heading: "8. Automatisierte Entscheidungsfindung",
        body: [
          "Im Zusammenhang mit gewöhnlichen Einkäufen im Online-Shop treffen wir keine ausschließlich auf automatisierter Verarbeitung beruhenden Entscheidungen, die Ihnen gegenüber rechtliche Wirkung entfalten oder Sie in ähnlicher Weise erheblich beeinträchtigen, sofern für einen bestimmten Dienst nichts anderes angegeben ist.",
        ],
      },
      {
        heading: "9. Schlussinformationen",
        body: [
          "Die aktuelle Fassung dieses Dokuments wird auf dieser Seite zusammen mit der Versionsnummer und dem Datum der Überarbeitung veröffentlicht.",
          "War dieses Dokument Bestandteil der im Zusammenhang mit einer Bestellung oder Einwilligung bereitgestellten Informationen, richtet sich die maßgebliche Fassung nach dem zum jeweiligen Zeitpunkt geltenden Wortlaut.",
        ],
      },
    ],
  },
  {
    type: 'PRIVACY',
    locale: 'cs',
    title: "Zásady ochrany osobních údajů",
    intro: "Tento dokument obsahuje informace o zpracování osobních údajů podle nařízení Evropského parlamentu a Rady (EU) 2016/679 („GDPR“) a příslušných právních předpisů Slovenské republiky.\n\nSprávcem osobních údajů je {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, se sídlem {legalAddress}.\n\nKontakt pro otázky týkající se ochrany osobních údajů: {supportEmail}.",
    sections: [
      {
        heading: "1. Nákup zboží a vyřízení objednávky",
        body: [
          "Pro přijetí, zpracování a vyřízení objednávky zpracováváme zejména jméno a příjmení, e-mailovou adresu, telefonní číslo, doručovací a fakturační adresu, údaje o objednaném zboží, platbě a doručení a údaje potřebné pro komunikaci se zákazníkem.",
          "Právním základem zpracování je zejména čl. 6 odst. 1 písm. b) GDPR – zpracování nezbytné pro plnění smlouvy nebo provedení opatření před uzavřením smlouvy – a čl. 6 odst. 1 písm. c) GDPR v případech, kdy je zpracování nezbytné pro splnění právní povinnosti, zejména v oblasti účetnictví a daní.",
          "Bez údajů nezbytných pro uzavření a plnění smlouvy není možné objednávku řádně zpracovat a doručit.",
          "Údaje související s objednávkou uchováváme po dobu nezbytnou pro splnění smlouvy a následně po dobu vyplývající z příslušných účetních, daňových a dalších právních předpisů. Některé doklady mohou být uchovávány zpravidla až 10 let, pokud to vyžadují příslušné právní předpisy.",
        ],
      },
      {
        heading: "2. Zákaznický účet",
        body: [
          "Pokud si zákazník vytvoří nebo používá zákaznický účet, zpracováváme identifikační a kontaktní údaje, údaje potřebné pro přihlášení nebo ověření a historii objednávek a dalších úkonů spojených s účtem.",
          "Právním základem je čl. 6 odst. 1 písm. b) GDPR – plnění smlouvy o vedení zákaznického účtu nebo provedení opatření na žádost zákazníka.",
          "Údaje vztahující se výhradně k zákaznickému účtu uchováváme po dobu existence účtu. Zrušením účtu není dotčeno další uchovávání údajů, které jsme povinni uchovávat podle zákona nebo které jsou potřebné pro určení, výkon nebo obhajobu právních nároků.",
        ],
      },
      {
        heading: "3. Právní povinnosti a oprávněné zájmy",
        body: [
          "Osobní údaje můžeme zpracovávat také za účelem plnění právních povinností, určení, výkonu nebo obhajoby právních nároků, předcházení podvodům, zabezpečení služeb a spolupráce s oprávněnými orgány veřejné moci.",
          "Právním základem může být podle konkrétního účelu čl. 6 odst. 1 písm. c) GDPR – splnění právní povinnosti – nebo čl. 6 odst. 1 písm. f) GDPR – oprávněný zájem správce nebo třetí strany.",
          "Při zpracování založeném na oprávněném zájmu posuzujeme, zda nad tímto zájmem nepřevažují práva a svobody subjektu údajů.",
        ],
      },
      {
        heading: "4. Příjemci a zpracovatelé",
        body: [
          "Osobní údaje mohou být v nezbytném rozsahu poskytovány nebo zpřístupněny zejména těmto kategoriím příjemců a zpracovatelů:",
          "- poskytovatelům přepravních, kurýrních a doručovacích služeb;",
          "- poskytovatelům platebních služeb a platebních bran;",
          "- poskytovatelům IT infrastruktury, hostingu, cloudových a e-mailových služeb;",
          "- účetním, daňovým a právním poradcům;",
          "- poskytovatelům technických, analytických nebo marketingových služeb, pokud jsou tyto služby používány v souladu s vaším nastavením souhlasu a platnými právními předpisy;",
          "- orgánům veřejné moci, pokud to vyžaduje zákon.",
          "Údaje o platebních kartách přímo nezpracováváme, pokud je zákazník zadává přímo v prostředí příslušného poskytovatele platebních služeb.",
          "Osobní údaje neprodáváme třetím stranám.",
          "Pokud při používání konkrétní služby dochází k předávání osobních údajů mimo Evropský hospodářský prostor, probíhá takové předávání pouze v souladu s GDPR, zejména na základě rozhodnutí o odpovídající ochraně nebo vhodných záruk, jako jsou standardní smluvní doložky, pokud jsou vyžadovány.",
        ],
      },
      {
        heading: "5. Marketing, analytika a cookies",
        body: [
          "Obchodní sdělení zasíláme pouze na základě příslušného právního titulu a v rozsahu povoleném platnými právními předpisy. Pokud je zpracování založeno na souhlasu, lze souhlas kdykoli odvolat. Pokud právní předpisy umožňují zasílání obchodních sdělení stávajícím zákazníkům bez samostatného souhlasu, zákazník má vždy možnost jednoduchým způsobem odmítnout jejich další zasílání.",
          "Na webových stránkách používáme technologie nezbytné pro fungování internetového obchodu. Volitelné analytické a marketingové technologie používáme pouze v souladu s vaším nastavením souhlasu a platnými právními předpisy.",
          "Pro správu technických, analytických a marketingových značek můžeme používat Google Tag Manager. Google Tag Manager slouží především k technické správě značek; konkrétní zpracování osobních údajů závisí na službách a značkách, které jsou jeho prostřednictvím aktivovány.",
          "Konkrétní analytické a marketingové služby, které jsou aktuálně používány, jejich účely, právní základy, používané cookies nebo obdobné technologie a možnosti změny souhlasu jsou uvedeny v [[cookies|Zásadách používání cookies]] a v nastavení cookies.",
          "Pokud to vyžadují právní předpisy nebo pravidla používaných služeb, analytické a reklamní značky se aktivují až po udělení příslušného souhlasu uživatele.",
          "Prostřednictvím analytických a marketingových služeb mohou být zpracovávány zejména technické údaje o zařízení a prohlížeči, údaje o interakci s webovou stránkou a informace o stavu souhlasu. Do analytických nebo reklamních značek záměrně neposíláme jméno, poštovní adresu, telefonní číslo ani e-mailovou adresu, pokud k tomu neexistuje zvláštní právní základ a odpovídající nastavení příslušné služby.",
          "Souhlas s volitelnými analytickými nebo marketingovými technologiemi můžete kdykoli změnit nebo odvolat prostřednictvím nastavení cookies.",
        ],
      },
      {
        heading: "6. Doba uchovávání údajů",
        body: [
          "Osobní údaje uchováváme pouze po dobu nezbytnou pro účel, pro který byly získány, nebo po dobu vyžadovanou příslušnými právními předpisy.",
          "Konkrétní doba uchovávání závisí na účelu zpracování. Údaje související s účetními a daňovými povinnostmi se uchovávají po dobu stanovenou zákonem. Údaje potřebné pro určení, výkon nebo obhajobu právních nároků mohou být uchovávány po dobu příslušných promlčecích lhůt.",
          "Po uplynutí příslušné doby údaje vymažeme nebo anonymizujeme, pokud neexistuje jiný zákonný důvod pro jejich další uchovávání.",
        ],
      },
      {
        heading: "7. Vaše práva",
        body: [
          "Za podmínek stanovených GDPR máte zejména právo:",
          "- na přístup ke svým osobním údajům;",
          "- na opravu nesprávných nebo neúplných údajů;",
          "- na výmaz osobních údajů;",
          "- na omezení zpracování;",
          "- na přenositelnost údajů;",
          "- vznést námitku proti zpracování založenému na oprávněném zájmu;",
          "- kdykoli odvolat souhlas, pokud je zpracování založeno na souhlasu.",
          "Odvolání souhlasu nemá vliv na zákonnost zpracování provedeného před jeho odvoláním.",
          "Svá práva můžete uplatnit e-mailem na adrese {supportEmail} nebo prostřednictvím dalších kontaktních údajů správce uvedených na stránce [[contacts|Kontakty]].",
          "Máte rovněž právo podat stížnost u příslušného dozorového úřadu pro ochranu osobních údajů. Správce usazený ve Slovenské republice podléhá dozoru Úřadu na ochranu osobních údajů Slovenské republiky. Pokud máte obvyklé bydliště nebo místo výkonu práce v jiném členském státě EU, můžete se za podmínek GDPR obrátit také na příslušný dozorový úřad v tomto členském státě.",
        ],
      },
      {
        heading: "8. Automatizované rozhodování",
        body: [
          "Při běžném nákupu v internetovém obchodě neprovádíme rozhodování založené výhradně na automatizovaném zpracování, které by vůči vám mělo právní účinky nebo vás obdobným způsobem významně ovlivňovalo, pokud není u konkrétní služby uvedeno jinak.",
        ],
      },
      {
        heading: "9. Závěrečné informace",
        body: [
          "Aktuální verze tohoto dokumentu je zveřejněna na této stránce spolu s číslem verze a datem revize.",
          "Pokud tento dokument tvořil součást informací poskytnutých v souvislosti s objednávkou nebo udělením souhlasu, příslušná verze se posuzuje podle znění platného v daném okamžiku.",
        ],
      },
    ],
  },
  {
    type: 'PRIVACY',
    locale: 'uk',
    title: "Політика конфіденційності та захисту персональних даних",
    intro: "Цей документ містить інформацію про обробку персональних даних відповідно до Регламенту Європейського Парламенту і Ради (ЄС) 2016/679 («GDPR») та застосовного законодавства Словацької Республіки.\n\nКонтролером персональних даних є {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, із зареєстрованим місцезнаходженням: {legalAddress}.\n\nКонтакт для питань щодо захисту персональних даних: {supportEmail}.",
    sections: [
      {
        heading: "1. Купівля товарів та обробка замовлення",
        body: [
          "Для прийняття, обробки та виконання замовлення ми обробляємо, зокрема, ім’я та прізвище покупця, адресу електронної пошти, номер телефону, адресу доставки та платіжну адресу, інформацію про замовлені товари, оплату й доставку, а також дані, необхідні для комунікації з покупцем.",
          "Правовою підставою для обробки є насамперед ст. 6(1)(b) GDPR – обробка, необхідна для виконання договору або здійснення заходів до укладення договору, – та ст. 6(1)(c) GDPR у випадках, коли обробка необхідна для виконання юридичного обов’язку, зокрема у сфері бухгалтерського обліку та оподаткування.",
          "Без даних, необхідних для укладення та виконання договору, ми не можемо належним чином обробити та доставити замовлення.",
          "Дані, пов’язані із замовленням, зберігаються протягом строку, необхідного для виконання договору, а після цього – протягом строків, передбачених відповідним бухгалтерським, податковим та іншим законодавством. Деякі документи можуть зберігатися, як правило, до 10 років, якщо цього вимагає відповідне законодавство.",
        ],
      },
      {
        heading: "2. Обліковий запис покупця",
        body: [
          "Якщо покупець створює або використовує обліковий запис, ми обробляємо ідентифікаційні та контактні дані, дані, необхідні для входу або підтвердження особи, а також історію замовлень та інших дій, пов’язаних з обліковим записом.",
          "Правовою підставою є ст. 6(1)(b) GDPR – виконання договору щодо ведення облікового запису покупця або здійснення заходів на запит покупця.",
          "Дані, пов’язані виключно з обліковим записом, зберігаються протягом строку його існування. Закриття облікового запису не впливає на подальше зберігання даних, які ми зобов’язані зберігати відповідно до закону або які необхідні для встановлення, здійснення чи захисту правових вимог.",
        ],
      },
      {
        heading: "3. Юридичні обов’язки та законні інтереси",
        body: [
          "Ми також можемо обробляти персональні дані для виконання юридичних обов’язків, встановлення, здійснення або захисту правових вимог, запобігання шахрайству, забезпечення безпеки наших сервісів та співпраці з уповноваженими державними органами.",
          "Залежно від конкретної мети правовою підставою може бути ст. 6(1)(c) GDPR – виконання юридичного обов’язку – або ст. 6(1)(f) GDPR – законний інтерес контролера або третьої сторони.",
          "Якщо обробка ґрунтується на законному інтересі, ми оцінюємо, чи не переважають над цим інтересом права та свободи суб’єкта персональних даних.",
        ],
      },
      {
        heading: "4. Одержувачі та обробники даних",
        body: [
          "У необхідному обсязі персональні дані можуть передаватися або надаватися, зокрема, таким категоріям одержувачів та обробників:",
          "- постачальникам транспортних, кур’єрських та поштових послуг;",
          "- постачальникам платіжних послуг і платіжним шлюзам;",
          "- постачальникам IT-інфраструктури, хостингу, хмарних сервісів та електронної пошти;",
          "- бухгалтерським, податковим і юридичним консультантам;",
          "- постачальникам технічних, аналітичних або маркетингових послуг, якщо такі послуги використовуються відповідно до ваших налаштувань згоди та застосовного законодавства;",
          "- державним органам, якщо цього вимагає закон.",
          "Ми не обробляємо безпосередньо дані платіжних карток, якщо покупець вводить їх безпосередньо в середовищі відповідного постачальника платіжних послуг.",
          "Ми не продаємо персональні дані третім особам.",
          "Якщо використання певної послуги передбачає передачу персональних даних за межі Європейського економічного простору, така передача здійснюється виключно відповідно до GDPR, зокрема на підставі рішення про належний рівень захисту або відповідних гарантій, таких як стандартні договірні положення, якщо вони необхідні.",
        ],
      },
      {
        heading: "5. Маркетинг, аналітика та cookies",
        body: [
          "Маркетингові повідомлення ми надсилаємо лише за наявності відповідної правової підстави та в межах, дозволених застосовним законодавством. Якщо обробка ґрунтується на згоді, згоду можна відкликати в будь-який час. Якщо законодавство дозволяє надсилати маркетингові повідомлення існуючим покупцям без окремої згоди, покупцю завжди надається простий спосіб відмовитися від подальших повідомлень.",
          "Ми використовуємо технології, необхідні для роботи інтернет-магазину. Необов’язкові аналітичні та маркетингові технології використовуються лише відповідно до ваших налаштувань згоди та застосовного законодавства.",
          "Для керування технічними, аналітичними та маркетинговими тегами ми можемо використовувати Google Tag Manager. Google Tag Manager використовується насамперед для технічного керування тегами; конкретна обробка персональних даних залежить від сервісів і тегів, активованих через нього.",
          "Актуально використовувані аналітичні та маркетингові сервіси, їхні цілі, правові підстави, використовувані cookies або аналогічні технології та способи зміни згоди зазначені в нашій [[cookies|Політиці cookies]] і в налаштуваннях cookies.",
          "Якщо цього вимагає законодавство або правила відповідних сервісів, аналітичні та рекламні теги активуються лише після надання відповідної згоди користувача.",
          "Аналітичні та маркетингові сервіси можуть обробляти, зокрема, технічну інформацію про пристрій і браузер, інформацію про взаємодію з вебсайтом та інформацію про стан згоди. Ми навмисно не передаємо ім’я, поштову адресу, номер телефону чи адресу електронної пошти в аналітичні або рекламні теги, якщо для цього немає окремої правової підстави та відповідного налаштування сервісу.",
          "Ви можете в будь-який час змінити або відкликати згоду на необов’язкові аналітичні чи маркетингові технології через налаштування cookies.",
        ],
      },
      {
        heading: "6. Строк зберігання даних",
        body: [
          "Ми зберігаємо персональні дані лише протягом строку, необхідного для мети, з якою вони були отримані, або протягом строку, передбаченого застосовним законодавством.",
          "Конкретний строк зберігання залежить від мети обробки. Дані, пов’язані з бухгалтерськими та податковими обов’язками, зберігаються протягом установленого законом строку. Дані, необхідні для встановлення, здійснення або захисту правових вимог, можуть зберігатися протягом відповідних строків позовної давності.",
          "Після закінчення відповідного строку дані видаляються або анонімізуються, якщо немає іншої законної підстави для їх подальшого зберігання.",
        ],
      },
      {
        heading: "7. Ваші права",
        body: [
          "За умов, установлених GDPR, ви маєте, зокрема, право:",
          "- на доступ до своїх персональних даних;",
          "- на виправлення неправильних або неповних даних;",
          "- на видалення персональних даних;",
          "- на обмеження обробки;",
          "- на перенесення даних;",
          "- заперечувати проти обробки, що ґрунтується на законному інтересі;",
          "- у будь-який час відкликати згоду, якщо обробка ґрунтується на згоді.",
          "Відкликання згоди не впливає на законність обробки, здійсненої до її відкликання.",
          "Ви можете реалізувати свої права електронною поштою за адресою {supportEmail} або за іншими контактними даними контролера, зазначеними на сторінці [[contacts|Контакти]].",
          "Ви також маєте право подати скаргу до компетентного наглядового органу із захисту персональних даних. Контролер, зареєстрований у Словацькій Республіці, перебуває під наглядом Управління із захисту персональних даних Словацької Республіки. Якщо ваше звичайне місце проживання або місце роботи знаходиться в іншій державі-члені ЄС, ви також можете звернутися до компетентного наглядового органу цієї держави-члена відповідно до GDPR.",
        ],
      },
      {
        heading: "8. Автоматизоване прийняття рішень",
        body: [
          "Під час звичайних покупок в інтернет-магазині ми не здійснюємо прийняття рішень, що ґрунтується виключно на автоматизованій обробці та має для вас юридичні наслідки або подібним чином істотно на вас впливає, якщо для конкретної послуги не зазначено інше.",
        ],
      },
      {
        heading: "9. Заключна інформація",
        body: [
          "Актуальна версія цього документа публікується на цій сторінці разом із номером версії та датою редакції.",
          "Якщо цей документ був частиною інформації, наданої у зв’язку із замовленням або наданням згоди, застосовною є редакція, що діяла у відповідний момент.",
        ],
      },
    ],
  },
]

