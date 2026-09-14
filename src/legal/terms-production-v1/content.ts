import type { LegalSeedEntry } from '../legal-seed.types'

/** First production TERMS (VOP) Version 1 — EU-neutral, same document for all hosts. */
export const TERMS_PRODUCTION_V1: LegalSeedEntry[] = [
  {
    type: 'TERMS',
    locale: 'sk',
    title: "Všeobecné obchodné podmienky",
    intro: "Tieto všeobecné obchodné podmienky (ďalej len „VOP“) upravujú nákup tovaru prostredníctvom internetového obchodu prevádzkovaného spoločnosťou {sellerName}. Odoslaním objednávky kupujúci potvrdzuje, že sa s týmito VOP oboznámil a súhlasí s nimi.",
    sections: [
      {
        heading: "1. Predávajúci a kupujúci",
        body: [
          "Predávajúcim je {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, so sídlom {legalAddress}.",
          "Kupujúcim je každá osoba, ktorá prostredníctvom internetového obchodu odošle objednávku. Spotrebiteľom je fyzická osoba, ktorá pri uzatváraní a plnení zmluvy nekoná v rámci svojej podnikateľskej činnosti, zamestnania alebo povolania.",
          "Ak je kupujúcim spotrebiteľ, uplatňujú sa na zmluvný vzťah príslušné ustanovenia právnych predpisov na ochranu spotrebiteľa vrátane práv, ktoré spotrebiteľovi nemožno zmluvne odňať.",
          "Zmluvné strany uznávajú elektronickú komunikáciu prostredníctvom internetového obchodu a e-mailu, prípadne komunikáciu prostredníctvom telefónu.",
        ],
      },
      {
        heading: "2. Ceny",
        body: [
          "Ceny tovaru sú konečné a zahŕňajú DPH v sadzbe uplatniteľnej na konkrétny predaj podľa platných daňových predpisov, ak pri tovare nie je uvedené inak.",
          "Výsledná cena objednávky vrátane prípadných nákladov na dopravu a ďalších poplatkov je kupujúcemu zobrazená pred záväzným odoslaním objednávky.",
          "Predávajúci je viazaný cenou zobrazenou kupujúcemu v okamihu odoslania objednávky, s výnimkou prípadu zjavnej technickej chyby.",
          "Ak je tovar označený ako zľavnený, informácie o predchádzajúcej cene a zľave sa uvádzajú v súlade s platnými pravidlami ochrany spotrebiteľa.",
          "V prípade zjavne nesprávnej ceny spôsobenej technickou alebo obdobnou chybou predávajúci bezodkladne informuje kupujúceho a navrhne ďalší postup alebo správnu cenu. Kupujúci nie je povinný akceptovať zmenenú cenu.",
        ],
      },
      {
        heading: "3. Objednávka a uzavretie kúpnej zmluvy",
        body: [
          "Objednávku možno vytvoriť prostredníctvom internetového obchodu bez registrácie, ak internetový obchod pri konkrétnom nákupe neuvádza inak.",
          "Pred odoslaním objednávky má kupujúci možnosť skontrolovať a opraviť zadané údaje, vybraný tovar, množstvo, spôsob dopravy a platby, ako aj celkovú cenu objednávky.",
          "Odoslaním objednávky kupujúci potvrdzuje svoj súhlas s objednávkou a s povinnosťou zaplatiť uvedenú cenu.",
          "Tlačidlo na záväzné odoslanie objednávky je označené tak, aby bolo kupujúcemu zrejmé, že odoslaním objednávky vzniká povinnosť platby.",
          "Kúpna zmluva vzniká potvrdením objednávky predávajúcim prostredníctvom e-mailu. Zmenu alebo zrušenie objednávky je možné vykonať dohodou medzi kupujúcim a predávajúcim, ak právne predpisy alebo tieto VOP neustanovujú inak.",
        ],
      },
      {
        heading: "4. Platba a dodanie",
        body: [
          "Aktuálne dostupné spôsoby platby a dopravy, ich ceny a prípadné obmedzenia sú kupujúcemu zobrazené v pokladni podľa zvolenej krajiny doručenia a aktuálnej ponuky internetového obchodu.",
          "Podrobnejšie informácie sú uvedené na stránke [[shipping|Doprava a platba]].",
          "Dodacia lehota závisí najmä od dostupnosti rastlín, sezóny, charakteru objednaného tovaru, krajiny doručenia a zvoleného spôsobu dopravy.",
          "Ak je tovar ponúkaný formou predobjednávky alebo s neskorším termínom dostupnosti, príslušná informácia je uvedená pri tovare alebo v objednávke.",
          "Pri dodaní spotrebiteľovi prechádza riziko poškodenia alebo straty tovaru na spotrebiteľa spravidla okamihom, keď spotrebiteľ alebo ním určená tretia osoba prevezme tovar, ak príslušné právne predpisy neustanovujú inak.",
          "Pri viditeľnom poškodení zásielky odporúčame poškodenie zdokumentovať, podľa možnosti ho oznámiť dopravcovi a bezodkladne kontaktovať predávajúceho.",
        ],
      },
      {
        heading: "5. Odstúpenie od zmluvy spotrebiteľom",
        body: [
          "Spotrebiteľ má pri zmluve uzavretej na diaľku právo odstúpiť od zmluvy v zákonnej lehote, spravidla do 14 dní od prevzatia tovaru, ak sa na konkrétny prípad nevzťahuje zákonná výnimka.",
          "Pri živých rastlinách, tovare podliehajúcom rýchlemu zníženiu kvality alebo skaze a pri ďalších zákonom stanovených prípadoch môže byť právo na odstúpenie obmedzené alebo vylúčené.",
          "Podrobné informácie o práve na odstúpenie, výnimkách, lehote a postupe pri vrátení tovaru sú uvedené na stránke [[returns|Vrátenie tovaru a odstúpenie od zmluvy]].",
          "Ak kupujúci zistí poškodenie spôsobené prepravou alebo nesúlad dodaného tovaru s objednávkou, odporúčame kontaktovať predávajúceho čo najskôr a priložiť fotodokumentáciu. Toto odporúčanie neobmedzuje zákonné práva spotrebiteľa z vadného plnenia.",
          "Vzorový formulár na odstúpenie od zmluvy je dostupný na stránke Vrátenie tovaru. Tovar sa vracia na adresu uvedenú predávajúcim, pokiaľ sa predávajúci a kupujúci nedohodnú inak.",
        ],
      },
      {
        heading: "6. Rastlinné pasy a fytosanitárne povinnosti",
        body: [
          "Pri premiestňovaní rastlín v rámci Európskej únie sa uplatňujú príslušné právne predpisy EÚ v oblasti ochrany rastlín, najmä nariadenie (EÚ) 2016/2031 a súvisiace vykonávacie predpisy vrátane nariadenia (EÚ) 2019/2072.",
          "Rastliny, pri ktorých sa vyžaduje rastlinný pas, sú označené v súlade s príslušnými právnymi predpismi. Rastlinný pas slúži okrem iného na vysledovateľnosť rastlín v rámci dodávateľského reťazca.",
          "Predávajúci plní povinnosti profesionálneho prevádzkovateľa vzťahujúce sa na internetový predaj rastlín a príslušné fytosanitárne požiadavky.",
          "Informácie príslušného slovenského orgánu ÚKSÚP o internetovom predaji rastlín sú dostupné na jeho oficiálnej webovej stránke.",
          "Na dovoz alebo premiestňovanie rastlín z tretích krajín sa môžu vzťahovať osobitné zákazy, obmedzenia a fytosanitárne požiadavky.",
        ],
      },
      {
        heading: "7. Reklamácie a zodpovednosť za vady",
        body: [
          "Predávajúci zodpovedá za vady tovaru v rozsahu stanovenom príslušnými právnymi predpismi.",
          "Pri posudzovaní stavu živých rastlín sa zohľadňuje ich prirodzený biologický charakter. Predávajúci nezodpovedá za poškodenie alebo uhynutie rastliny spôsobené po jej prevzatí okolnosťami na strane kupujúceho, najmä nesprávnou starostlivosťou, nevhodnou výsadbou, mrazom, preschnutím, premokrením alebo mechanickým poškodením, ak za takúto okolnosť predávajúci podľa právnych predpisov nezodpovedá.",
          "Reklamáciu možno uplatniť prostredníctvom kontaktných údajov predávajúceho, najmä e-mailom na {supportEmail}. Pre rýchlejšie vybavenie odporúčame uviesť číslo objednávky, opis problému a podľa povahy vady priložiť fotografie.",
          "Uvedené odporúčania týkajúce sa spôsobu oznámenia reklamácie neobmedzujú zákonné práva spotrebiteľa.",
        ],
      },
      {
        heading: "8. Ochrana osobných údajov a rozhodné právo",
        body: [
          "Informácie o spracúvaní osobných údajov sú uvedené v samostatnom dokumente [[privacy|Podmienky ochrany osobných údajov]].",
          "Zmluvné vzťahy medzi predávajúcim a kupujúcim sa riadia právom Slovenskej republiky.",
          "Ak je kupujúci spotrebiteľom s obvyklým pobytom v inom členskom štáte Európskej únie, voľba slovenského práva ho nezbavuje ochrany poskytovanej ustanoveniami práva krajiny jeho obvyklého pobytu, od ktorých sa podľa príslušných pravidiel EÚ nemožno zmluvne odchýliť.",
          "Spotrebiteľ má právo obrátiť sa na predávajúceho so žiadosťou o nápravu. Ak spor nemožno vyriešiť dohodou, spotrebiteľ môže využiť príslušné možnosti alternatívneho riešenia spotrebiteľských sporov podľa platných právnych predpisov.",
          "Tieto VOP tvoria súčasť kúpnej zmluvy v znení platnom a zverejnenom v okamihu odoslania objednávky. Číslo a dátum revízie dokumentu sú uvedené na tejto stránke.",
        ],
      },
      {
        heading: "9. Orgány dozoru a riešenie sporov",
        body: [
          "Predávajúci podlieha dohľadu príslušných orgánov Slovenskej republiky podľa povahy jeho činnosti.",
          "V oblasti ochrany spotrebiteľa je príslušným orgánom najmä Slovenská obchodná inšpekcia (SOI).",
          "V oblasti rastlinolekárskej a fytosanitárnej kontroly je príslušným orgánom Ústredný kontrolný a skúšobný ústav poľnohospodársky v Bratislave (ÚKSÚP).",
          "Ak má spotrebiteľ obvyklý pobyt v inom členskom štáte Európskej únie, môže mať podľa príslušných právnych predpisov právo obrátiť sa aj na príslušné orgány alebo subjekty riešenia spotrebiteľských sporov vo svojej krajine.",
        ],
      },
      {
        heading: "10. Kontaktné údaje",
        body: [
          "Predávajúci: {sellerName}, so sídlom {legalAddress}.",
          "E-mail: {supportEmail}.",
          "Telefón a ďalšie aktuálne kontaktné údaje sú uvedené na stránke [[contacts|Kontakty]].",
        ],
      },
    ],
  },
  {
    type: 'TERMS',
    locale: 'en',
    title: "General Terms and Conditions",
    intro: "These General Terms and Conditions (“Terms”) govern the purchase of goods through the online store operated by {sellerName}. By submitting an order, the buyer confirms that they have read and agree to these Terms.",
    sections: [
      {
        heading: "1. Seller and buyer",
        body: [
          "The seller is {sellerName}, Company ID {ico}, Tax ID {dic}, VAT ID {icDph}, with its registered office at {legalAddress}.",
          "The buyer is any person who submits an order through the online store. A consumer is a natural person who, when entering into and performing the contract, is not acting within the scope of their business, employment or professional activity.",
          "Where the buyer is a consumer, the contractual relationship is also subject to the applicable consumer-protection legislation, including rights that cannot be contractually excluded or restricted.",
          "The parties acknowledge electronic communication through the online store and by email and, where appropriate, communication by telephone.",
        ],
      },
      {
        heading: "2. Prices",
        body: [
          "The prices of goods are final and include VAT at the rate applicable to the particular sale under the applicable tax rules, unless stated otherwise for the relevant product.",
          "The final order price, including any delivery costs and other applicable charges, is displayed to the buyer before the order is submitted with an obligation to pay.",
          "The seller is bound by the price displayed to the buyer at the time the order is submitted, except in the case of an obvious technical error.",
          "Where goods are advertised at a reduced price, information about the previous price and the discount is provided in accordance with the applicable consumer-protection rules.",
          "If an obviously incorrect price is displayed as a result of a technical or similar error, the seller will inform the buyer without undue delay and propose the appropriate next steps or the correct price. The buyer is not obliged to accept the amended price.",
        ],
      },
      {
        heading: "3. Order and conclusion of the purchase contract",
        body: [
          "An order may be placed through the online store without registration unless the online store states otherwise for a particular purchase.",
          "Before submitting the order, the buyer has the opportunity to review and correct the information entered, the selected goods and quantities, the delivery and payment method, and the total order price.",
          "By submitting the order, the buyer confirms the order and accepts the obligation to pay the stated price.",
          "The button used to submit a binding order is labelled in a manner that clearly indicates that submitting the order creates an obligation to pay.",
          "The purchase contract is concluded when the seller confirms the order by email. An order may be changed or cancelled by agreement between the buyer and the seller unless the law or these Terms provide otherwise.",
        ],
      },
      {
        heading: "4. Payment and delivery",
        body: [
          "The payment and delivery methods currently available, their prices and any applicable restrictions are displayed at checkout according to the selected country of delivery and the current offer of the online store.",
          "Further information is available on the [[shipping|Shipping and payment]] page.",
          "Delivery times depend in particular on plant availability, the season, the nature of the goods ordered, the country of delivery and the selected delivery method.",
          "Where goods are offered for pre-order or with a later availability date, the relevant information is displayed with the product or in the order.",
          "For deliveries to consumers, the risk of damage to or loss of the goods generally passes to the consumer when the consumer or a third party designated by the consumer takes possession of the goods, unless applicable law provides otherwise.",
          "If a shipment is visibly damaged, we recommend documenting the damage, notifying the carrier where possible and contacting the seller without undue delay.",
        ],
      },
      {
        heading: "5. Consumer right of withdrawal",
        body: [
          "For a distance contract, a consumer has the right to withdraw from the contract within the statutory period, generally within 14 days from receipt of the goods, unless a statutory exception applies.",
          "The right of withdrawal may be limited or excluded in the case of live plants, goods liable to deteriorate or expire rapidly, and in other cases provided for by law.",
          "Detailed information about the right of withdrawal, applicable exceptions, time limits and the procedure for returning goods is available on the [[returns|Returns and withdrawal]] page.",
          "If the buyer discovers transport damage or a discrepancy between the goods delivered and the order, we recommend contacting the seller as soon as possible and providing photographic evidence. This recommendation does not restrict the consumer's statutory rights in respect of defective performance.",
          "A model withdrawal form is available on the Returns page. Goods should be returned to the address specified by the seller unless the seller and the buyer agree otherwise.",
        ],
      },
      {
        heading: "6. Plant passports and phytosanitary requirements",
        body: [
          "The movement of plants within the European Union is subject to the applicable EU plant-health legislation, in particular Regulation (EU) 2016/2031 and related implementing legislation, including Regulation (EU) 2019/2072.",
          "Plants for which a plant passport is required are labelled in accordance with the applicable legislation. Among other purposes, a plant passport enables plants to be traced through the supply chain.",
          "The seller complies with the obligations applicable to professional operators engaged in the online sale of plants and with the relevant phytosanitary requirements.",
          "Information from the competent Slovak authority, ÚKSÚP, concerning the online sale of plants is available on its official website.",
          "The import or movement of plants from third countries may be subject to specific prohibitions, restrictions and phytosanitary requirements.",
        ],
      },
      {
        heading: "7. Complaints and liability for defects",
        body: [
          "The seller is liable for defects in the goods to the extent provided by the applicable legislation.",
          "When assessing the condition of live plants, their natural biological characteristics are taken into account. The seller is not liable for damage to or death of a plant caused after delivery by circumstances attributable to the buyer, in particular improper care, unsuitable planting, frost, drying out, excessive watering or mechanical damage, unless the seller is liable for such circumstances under applicable law.",
          "A complaint may be submitted using the seller's contact details, in particular by email to {supportEmail}. To help us process a complaint more quickly, we recommend providing the order number, a description of the issue and, where appropriate, photographs.",
          "These recommendations concerning the method of submitting a complaint do not restrict the consumer's statutory rights.",
        ],
      },
      {
        heading: "8. Personal data and governing law",
        body: [
          "Information about the processing of personal data is provided in the separate document [[privacy|Privacy Policy]].",
          "The contractual relationship between the seller and the buyer is governed by the law of the Slovak Republic.",
          "Where the buyer is a consumer whose habitual residence is in another Member State of the European Union, the choice of Slovak law does not deprive the consumer of the protection afforded by provisions of the law of the country of their habitual residence from which the parties may not derogate by agreement under the applicable EU rules.",
          "The consumer has the right to contact the seller with a request for remedy. If a dispute cannot be resolved by agreement, the consumer may use the applicable alternative consumer dispute-resolution mechanisms in accordance with the applicable legislation.",
          "These Terms form part of the purchase contract in the version valid and published at the time the order is submitted. The revision number and date of the document are displayed on this page.",
        ],
      },
      {
        heading: "9. Supervisory authorities and dispute resolution",
        body: [
          "The seller is subject to supervision by the competent authorities of the Slovak Republic according to the nature of its activities.",
          "In the field of consumer protection, the competent authority is in particular the Slovak Trade Inspection (SOI).",
          "In the field of plant-health and phytosanitary control, the competent authority is the Central Control and Testing Institute in Agriculture in Bratislava (ÚKSÚP).",
          "Where a consumer has their habitual residence in another Member State of the European Union, they may also have the right under the applicable legislation to contact the competent authorities or consumer dispute-resolution bodies in their own country.",
        ],
      },
      {
        heading: "10. Contact details",
        body: [
          "Seller: {sellerName}, registered office at {legalAddress}.",
          "Email: {supportEmail}.",
          "Telephone number and other current contact details are available on the [[contacts|Contact]] page.",
        ],
      },
    ],
  },
  {
    type: 'TERMS',
    locale: 'hu',
    title: "Általános Szerződési Feltételek",
    intro: "Jelen Általános Szerződési Feltételek („ÁSZF”) a {sellerName} által üzemeltetett webáruházban történő termékvásárlást szabályozzák. A megrendelés elküldésével a vásárló megerősíti, hogy megismerte és elfogadja a jelen ÁSZF-et.",
    sections: [
      {
        heading: "1. Eladó és vásárló",
        body: [
          "Az eladó: {sellerName}, cégjegyzék-/azonosító szám: {ico}, adóazonosító szám: {dic}, közösségi adószám: {icDph}, székhely: {legalAddress}.",
          "Vásárló minden olyan személy, aki a webáruházon keresztül megrendelést küld el. Fogyasztónak az a természetes személy minősül, aki a szerződés megkötése és teljesítése során nem üzleti, foglalkozási vagy szakmai tevékenysége körében jár el.",
          "Amennyiben a vásárló fogyasztónak minősül, a szerződéses jogviszonyra az alkalmazandó fogyasztóvédelmi szabályok is irányadók, ideértve azokat a jogokat is, amelyektől szerződéssel nem lehet a fogyasztó hátrányára eltérni.",
          "A felek elfogadják a webáruházon és e-mailen keresztül történő elektronikus kommunikációt, valamint szükség esetén a telefonos kapcsolattartást.",
        ],
      },
      {
        heading: "2. Árak",
        body: [
          "A termékek árai végleges árak, és tartalmazzák az adott értékesítésre az alkalmazandó adójogszabályok szerint irányadó általános forgalmi adót, kivéve, ha az adott terméknél ettől eltérő tájékoztatás szerepel.",
          "A megrendelés végleges összege, beleértve az esetleges szállítási költségeket és egyéb díjakat, a megrendelés fizetési kötelezettséggel járó elküldése előtt megjelenik a vásárló számára.",
          "Az eladót a megrendelés elküldésének időpontjában megjelenített ár köti, kivéve nyilvánvaló műszaki hiba esetén.",
          "Akciós termék esetén a korábbi árra és a kedvezményre vonatkozó információkat az alkalmazandó fogyasztóvédelmi szabályoknak megfelelően tüntetjük fel.",
          "Nyilvánvalóan hibás, műszaki vagy hasonló hiba miatt megjelenített ár esetén az eladó indokolatlan késedelem nélkül tájékoztatja a vásárlót, és javaslatot tesz a további eljárásra vagy közli a helyes árat. A vásárló nem köteles elfogadni a módosított árat.",
        ],
      },
      {
        heading: "3. Megrendelés és az adásvételi szerződés létrejötte",
        body: [
          "A webáruházban főszabály szerint regisztráció nélkül is leadható megrendelés, kivéve, ha az adott vásárlásnál a webáruház ettől eltérően rendelkezik.",
          "A megrendelés elküldése előtt a vásárlónak lehetősége van ellenőrizni és javítani a megadott adatokat, a kiválasztott termékeket és mennyiségeket, a szállítási és fizetési módot, valamint a megrendelés teljes összegét.",
          "A megrendelés elküldésével a vásárló megerősíti a megrendelést és vállalja a feltüntetett ár megfizetését.",
          "A megrendelés végleges elküldésére szolgáló gomb olyan módon van megjelölve, hogy egyértelmű legyen: a megrendelés elküldése fizetési kötelezettséget keletkeztet.",
          "Az adásvételi szerződés akkor jön létre, amikor az eladó e-mailben visszaigazolja a megrendelést. A megrendelés módosítása vagy törlése a vásárló és az eladó megállapodásával lehetséges, kivéve, ha jogszabály vagy jelen ÁSZF eltérően rendelkezik.",
        ],
      },
      {
        heading: "4. Fizetés és szállítás",
        body: [
          "Az aktuálisan elérhető fizetési és szállítási módok, azok díjai és esetleges korlátozásai a pénztárban jelennek meg a kiválasztott szállítási ország és a webáruház aktuális kínálata alapján.",
          "További részletek a [[shipping|Szállítás és fizetés]] oldalon találhatók.",
          "A szállítási idő különösen a növények elérhetőségétől, a szezontól, a megrendelt termék jellegétől, a szállítási országtól és a választott szállítási módtól függ.",
          "Előrendelhető vagy későbbi elérhetőségi időponttal kínált termék esetén az erre vonatkozó információ a termék mellett vagy a megrendelésben kerül feltüntetésre.",
          "Fogyasztónak történő szállítás esetén a termék elvesztésének vagy sérülésének kockázata főszabály szerint akkor száll át a fogyasztóra, amikor a fogyasztó vagy az általa kijelölt harmadik személy a terméket átveszi, kivéve, ha az alkalmazandó jogszabály másként rendelkezik.",
          "Láthatóan sérült küldemény esetén javasoljuk a sérülés dokumentálását, lehetőség szerint a fuvarozó értesítését, valamint az eladó mielőbbi megkeresését.",
        ],
      },
      {
        heading: "5. A fogyasztó elállási joga",
        body: [
          "Távollévők között kötött szerződés esetén a fogyasztót a jogszabályban meghatározott határidőn belül, általában a termék átvételétől számított 14 napon belül megilleti az elállás joga, kivéve, ha jogszabályi kivétel alkalmazandó.",
          "Élő növények, gyorsan romló vagy minőségüket rövid ideig megőrző termékek, valamint más, jogszabályban meghatározott esetekben az elállási jog korlátozott lehet vagy kizárható.",
          "Az elállási jogról, a kivételekről, a határidőkről és a termék visszaküldésének módjáról részletes tájékoztatás a [[returns|Termékvisszaküldés és elállás]] oldalon található.",
          "Ha a vásárló szállítási sérülést vagy a megrendeléstől eltérő teljesítést észlel, javasoljuk, hogy a lehető leghamarabb vegye fel a kapcsolatot az eladóval és lehetőség szerint csatoljon fényképes dokumentációt. Ez az ajánlás nem korlátozza a fogyasztó hibás teljesítésből eredő törvényes jogait.",
          "Az elállási nyilatkozat mintája a Termékvisszaküldés oldalon található. A terméket az eladó által megadott címre kell visszaküldeni, kivéve, ha az eladó és a vásárló ettől eltérően állapodik meg.",
        ],
      },
      {
        heading: "6. Növényútlevelek és növényegészségügyi követelmények",
        body: [
          "A növények Európai Unión belüli mozgatására az alkalmazandó uniós növényegészségügyi jogszabályok, különösen az (EU) 2016/2031 rendelet és a kapcsolódó végrehajtási szabályok, köztük az (EU) 2019/2072 rendelet irányadók.",
          "Azokat a növényeket, amelyekhez növényútlevél szükséges, az alkalmazandó jogszabályoknak megfelelően jelöljük. A növényútlevél többek között lehetővé teszi a növények nyomon követhetőségét az ellátási láncban.",
          "Az eladó teljesíti az online növényértékesítést végző hivatásos szereplőkre vonatkozó kötelezettségeket és az alkalmazandó növényegészségügyi előírásokat.",
          "Az online növényértékesítésre vonatkozó, illetékes szlovák hatóság (ÚKSÚP) által közzétett tájékoztatás annak hivatalos weboldalán érhető el.",
          "Harmadik országból származó növények behozatalára vagy mozgatására külön tilalmak, korlátozások és növényegészségügyi követelmények vonatkozhatnak.",
        ],
      },
      {
        heading: "7. Panaszkezelés és hibás teljesítés",
        body: [
          "Az eladó az alkalmazandó jogszabályokban meghatározott mértékben felel a termék hibáiért.",
          "Élő növények állapotának megítélésénél figyelembe kell venni azok természetes biológiai sajátosságait. Az eladó nem felel a növény átvételét követően a vásárlónak felróható körülmények, különösen nem megfelelő gondozás, helytelen ültetés, fagy, kiszáradás, túlöntözés vagy a vásárló által okozott mechanikai sérülés következtében bekövetkező károsodásért vagy pusztulásért, kivéve, ha az alkalmazandó jog alapján az eladó felelőssége fennáll.",
          "Panasz vagy reklamáció az eladó elérhetőségein, különösen a {supportEmail} e-mail-címen nyújtható be. A gyorsabb ügyintézés érdekében javasoljuk a rendelési szám, a probléma leírása és – a hiba jellegétől függően – fényképek megadását.",
          "A reklamáció bejelentésének módjára vonatkozó fenti ajánlások nem korlátozzák a fogyasztó törvényes jogait.",
        ],
      },
      {
        heading: "8. Személyes adatok és alkalmazandó jog",
        body: [
          "A személyes adatok kezelésére vonatkozó információkat a külön [[privacy|Adatvédelmi tájékoztató]] tartalmazza.",
          "Az eladó és a vásárló közötti szerződéses jogviszonyra a Szlovák Köztársaság joga irányadó.",
          "Ha a vásárló olyan fogyasztó, akinek szokásos tartózkodási helye az Európai Unió más tagállamában van, a szlovák jog választása nem fosztja meg őt a szokásos tartózkodási helye szerinti ország jogának azon kötelező védelmi rendelkezéseitől, amelyektől az alkalmazandó uniós szabályok alapján megállapodással nem lehet eltérni.",
          "A fogyasztó jogosult az eladóhoz fordulni jogorvoslat iránti kérelemmel. Ha a vita megállapodással nem rendezhető, a fogyasztó az alkalmazandó jogszabályok szerinti alternatív fogyasztói vitarendezési lehetőségeket is igénybe veheti.",
          "Jelen ÁSZF a megrendelés elküldésének időpontjában hatályos és közzétett változatban az adásvételi szerződés részét képezi. A dokumentum verziószáma és dátuma ezen az oldalon kerül feltüntetésre.",
        ],
      },
      {
        heading: "9. Felügyeleti hatóságok és vitarendezés",
        body: [
          "Az eladó tevékenységének jellegétől függően a Szlovák Köztársaság illetékes hatóságainak felügyelete alatt áll.",
          "A fogyasztóvédelem területén különösen a Szlovák Kereskedelmi Felügyelet (SOI) az illetékes hatóság.",
          "Növényegészségügyi és növényvédelmi ellenőrzések területén az illetékes hatóság a pozsonyi Központi Mezőgazdasági Ellenőrző és Vizsgáló Intézet (ÚKSÚP).",
          "Ha a fogyasztó szokásos tartózkodási helye az Európai Unió más tagállamában van, az alkalmazandó jogszabályok alapján jogosult lehet saját országának illetékes hatóságaihoz vagy fogyasztói vitarendezési szerveihez is fordulni.",
        ],
      },
      {
        heading: "10. Kapcsolattartási adatok",
        body: [
          "Eladó: {sellerName}, székhely: {legalAddress}.",
          "E-mail: {supportEmail}.",
          "A telefonszám és az egyéb aktuális elérhetőségek a [[contacts|Kapcsolat]] oldalon találhatók.",
        ],
      },
    ],
  },
  {
    type: 'TERMS',
    locale: 'de',
    title: "Allgemeine Geschäftsbedingungen",
    intro: "Diese Allgemeinen Geschäftsbedingungen („AGB“) regeln den Kauf von Waren über den von {sellerName} betriebenen Online-Shop. Mit dem Absenden einer Bestellung bestätigt der Käufer, dass er diese AGB zur Kenntnis genommen hat und ihnen zustimmt.",
    sections: [
      {
        heading: "1. Verkäufer und Käufer",
        body: [
          "Verkäufer ist {sellerName}, Unternehmens-ID {ico}, Steuer-ID {dic}, USt-IdNr. {icDph}, mit Sitz in {legalAddress}.",
          "Käufer ist jede Person, die über den Online-Shop eine Bestellung absendet. Verbraucher ist eine natürliche Person, die beim Abschluss und bei der Erfüllung des Vertrags nicht im Rahmen ihrer gewerblichen, geschäftlichen oder beruflichen Tätigkeit handelt.",
          "Ist der Käufer Verbraucher, gelten für das Vertragsverhältnis zusätzlich die anwendbaren Verbraucherschutzvorschriften einschließlich solcher Rechte, die vertraglich nicht zum Nachteil des Verbrauchers ausgeschlossen oder eingeschränkt werden können.",
          "Die Vertragsparteien erkennen die elektronische Kommunikation über den Online-Shop und per E-Mail sowie gegebenenfalls die telefonische Kommunikation an.",
        ],
      },
      {
        heading: "2. Preise",
        body: [
          "Die Preise der Waren sind Endpreise und enthalten die Mehrwertsteuer in der für den jeweiligen Verkauf nach den geltenden steuerrechtlichen Vorschriften anwendbaren Höhe, sofern beim jeweiligen Produkt nichts anderes angegeben ist.",
          "Der endgültige Bestellpreis einschließlich etwaiger Versandkosten und sonstiger Gebühren wird dem Käufer vor dem verbindlichen Absenden der Bestellung angezeigt.",
          "Der Verkäufer ist an den Preis gebunden, der dem Käufer zum Zeitpunkt der Absendung der Bestellung angezeigt wird, außer bei einem offensichtlichen technischen Fehler.",
          "Bei als reduziert gekennzeichneten Waren werden Angaben zum vorherigen Preis und zum Preisnachlass gemäß den geltenden Verbraucherschutzvorschriften gemacht.",
          "Wird aufgrund eines technischen oder vergleichbaren Fehlers ein offensichtlich falscher Preis angezeigt, informiert der Verkäufer den Käufer unverzüglich und schlägt das weitere Vorgehen oder den richtigen Preis vor. Der Käufer ist nicht verpflichtet, den geänderten Preis zu akzeptieren.",
        ],
      },
      {
        heading: "3. Bestellung und Abschluss des Kaufvertrags",
        body: [
          "Eine Bestellung kann grundsätzlich ohne Registrierung über den Online-Shop aufgegeben werden, sofern beim jeweiligen Kauf nichts anderes angegeben ist.",
          "Vor dem Absenden der Bestellung kann der Käufer die eingegebenen Daten, die ausgewählten Waren und Mengen, die Versand- und Zahlungsart sowie den Gesamtpreis der Bestellung überprüfen und korrigieren.",
          "Mit dem Absenden der Bestellung bestätigt der Käufer die Bestellung und übernimmt die Verpflichtung zur Zahlung des angegebenen Preises.",
          "Die Schaltfläche zum verbindlichen Absenden der Bestellung ist so gekennzeichnet, dass eindeutig erkennbar ist, dass mit dem Absenden eine Zahlungspflicht entsteht.",
          "Der Kaufvertrag kommt mit der Bestätigung der Bestellung durch den Verkäufer per E-Mail zustande. Eine Änderung oder Stornierung der Bestellung kann im gegenseitigen Einvernehmen erfolgen, sofern gesetzliche Vorschriften oder diese AGB nichts anderes bestimmen.",
        ],
      },
      {
        heading: "4. Zahlung und Lieferung",
        body: [
          "Die jeweils verfügbaren Zahlungs- und Versandarten, deren Kosten und etwaige Einschränkungen werden im Checkout entsprechend dem gewählten Lieferland und dem aktuellen Angebot des Online-Shops angezeigt.",
          "Weitere Einzelheiten finden Sie auf der Seite [[shipping|Versand und Zahlung]].",
          "Die Lieferzeit hängt insbesondere von der Verfügbarkeit der Pflanzen, der Saison, der Art der bestellten Waren, dem Lieferland und der gewählten Versandart ab.",
          "Wird eine Ware als Vorbestellung oder mit einem späteren Verfügbarkeitsdatum angeboten, wird die entsprechende Information beim Produkt oder in der Bestellung angezeigt.",
          "Bei einer Lieferung an einen Verbraucher geht die Gefahr des Verlusts oder der Beschädigung der Ware grundsätzlich in dem Zeitpunkt auf den Verbraucher über, in dem der Verbraucher oder ein von ihm benannter Dritter die Ware in Besitz nimmt, sofern die anwendbaren Rechtsvorschriften nichts anderes bestimmen.",
          "Bei sichtbar beschädigten Sendungen empfehlen wir, den Schaden zu dokumentieren, nach Möglichkeit dem Beförderer zu melden und den Verkäufer unverzüglich zu kontaktieren.",
        ],
      },
      {
        heading: "5. Widerrufsrecht des Verbrauchers",
        body: [
          "Bei einem Fernabsatzvertrag hat der Verbraucher das Recht, innerhalb der gesetzlichen Frist, in der Regel innerhalb von 14 Tagen ab Erhalt der Ware, vom Vertrag zurückzutreten bzw. den Vertrag zu widerrufen, sofern keine gesetzliche Ausnahme gilt.",
          "Bei lebenden Pflanzen, schnell verderblichen Waren oder Waren mit kurzer Haltbarkeit sowie in anderen gesetzlich vorgesehenen Fällen kann das Widerrufsrecht eingeschränkt oder ausgeschlossen sein.",
          "Ausführliche Informationen zum Widerrufsrecht, zu Ausnahmen, Fristen und zum Verfahren der Rücksendung finden Sie auf der Seite [[returns|Rückgabe und Widerruf]].",
          "Stellt der Käufer einen Transportschaden oder eine Abweichung der gelieferten Ware von der Bestellung fest, empfehlen wir, den Verkäufer möglichst rasch zu kontaktieren und gegebenenfalls Fotos beizufügen. Diese Empfehlung schränkt die gesetzlichen Rechte des Verbrauchers bei mangelhafter Leistung nicht ein.",
          "Ein Muster-Widerrufsformular ist auf der Seite Rückgabe verfügbar. Die Ware ist an die vom Verkäufer angegebene Adresse zurückzusenden, sofern Verkäufer und Käufer nichts anderes vereinbaren.",
        ],
      },
      {
        heading: "6. Pflanzenpässe und phytosanitäre Anforderungen",
        body: [
          "Für die Verbringung von Pflanzen innerhalb der Europäischen Union gelten die einschlägigen EU-Pflanzengesundheitsvorschriften, insbesondere die Verordnung (EU) 2016/2031 sowie die dazugehörigen Durchführungsvorschriften einschließlich der Verordnung (EU) 2019/2072.",
          "Pflanzen, für die ein Pflanzenpass vorgeschrieben ist, werden entsprechend den anwendbaren Vorschriften gekennzeichnet. Der Pflanzenpass ermöglicht unter anderem die Rückverfolgbarkeit von Pflanzen innerhalb der Lieferkette.",
          "Der Verkäufer erfüllt die Pflichten eines professionellen Unternehmers im Zusammenhang mit dem Online-Verkauf von Pflanzen sowie die einschlägigen phytosanitären Anforderungen.",
          "Informationen der zuständigen slowakischen Behörde ÚKSÚP zum Online-Verkauf von Pflanzen sind auf deren offizieller Website verfügbar.",
          "Für die Einfuhr oder Verbringung von Pflanzen aus Drittländern können besondere Verbote, Beschränkungen und phytosanitäre Anforderungen gelten.",
        ],
      },
      {
        heading: "7. Reklamationen und Mängelhaftung",
        body: [
          "Der Verkäufer haftet für Mängel der Ware in dem Umfang, der sich aus den anwendbaren Rechtsvorschriften ergibt.",
          "Bei der Beurteilung des Zustands lebender Pflanzen sind deren natürliche biologische Eigenschaften zu berücksichtigen. Der Verkäufer haftet nicht für Schäden oder das Absterben einer Pflanze nach der Übernahme, soweit diese durch Umstände auf Seiten des Käufers verursacht wurden, insbesondere durch unsachgemäße Pflege, ungeeignete Pflanzung, Frost, Austrocknung, Staunässe oder mechanische Beschädigung, sofern der Verkäufer nach geltendem Recht hierfür nicht einzustehen hat.",
          "Eine Reklamation kann über die Kontaktdaten des Verkäufers, insbesondere per E-Mail an {supportEmail}, geltend gemacht werden. Zur schnelleren Bearbeitung empfehlen wir, die Bestellnummer und eine Beschreibung des Problems anzugeben sowie, soweit sinnvoll, Fotos beizufügen.",
          "Diese Empfehlungen zur Form der Reklamation schränken die gesetzlichen Rechte des Verbrauchers nicht ein.",
        ],
      },
      {
        heading: "8. Datenschutz und anwendbares Recht",
        body: [
          "Informationen zur Verarbeitung personenbezogener Daten finden Sie im gesonderten Dokument [[privacy|Datenschutzerklärung]].",
          "Für das Vertragsverhältnis zwischen Verkäufer und Käufer gilt das Recht der Slowakischen Republik.",
          "Ist der Käufer Verbraucher und hat er seinen gewöhnlichen Aufenthalt in einem anderen Mitgliedstaat der Europäischen Union, darf die Wahl slowakischen Rechts nicht dazu führen, dass ihm der Schutz zwingender Bestimmungen des Rechts seines gewöhnlichen Aufenthalts entzogen wird, von denen nach den einschlägigen EU-Regelungen nicht vertraglich abgewichen werden darf.",
          "Der Verbraucher kann sich mit einem Antrag auf Abhilfe an den Verkäufer wenden. Kann ein Streit nicht einvernehmlich beigelegt werden, kann der Verbraucher die nach den geltenden Rechtsvorschriften vorgesehenen Möglichkeiten der alternativen Verbraucherstreitbeilegung nutzen.",
          "Diese AGB sind in der zum Zeitpunkt der Absendung der Bestellung gültigen und veröffentlichten Fassung Bestandteil des Kaufvertrags. Versionsnummer und Datum des Dokuments sind auf dieser Seite angegeben.",
        ],
      },
      {
        heading: "9. Aufsichtsbehörden und Streitbeilegung",
        body: [
          "Der Verkäufer unterliegt entsprechend der Art seiner Tätigkeit der Aufsicht der zuständigen Behörden der Slowakischen Republik.",
          "Im Bereich des Verbraucherschutzes ist insbesondere die Slowakische Handelsinspektion (SOI) zuständig.",
          "Im Bereich Pflanzengesundheit und phytosanitäre Kontrolle ist das Zentrale Kontroll- und Prüfinstitut für Landwirtschaft in Bratislava (ÚKSÚP) zuständig.",
          "Hat der Verbraucher seinen gewöhnlichen Aufenthalt in einem anderen Mitgliedstaat der Europäischen Union, kann er nach den anwendbaren Rechtsvorschriften gegebenenfalls auch die zuständigen Behörden oder Verbraucherschlichtungsstellen seines eigenen Landes in Anspruch nehmen.",
        ],
      },
      {
        heading: "10. Kontaktdaten",
        body: [
          "Verkäufer: {sellerName}, Sitz: {legalAddress}.",
          "E-Mail: {supportEmail}.",
          "Telefonnummer und weitere aktuelle Kontaktdaten finden Sie auf der Seite [[contacts|Kontakt]].",
        ],
      },
    ],
  },
  {
    type: 'TERMS',
    locale: 'cs',
    title: "Všeobecné obchodní podmínky",
    intro: "Tyto všeobecné obchodní podmínky („VOP“) upravují nákup zboží prostřednictvím internetového obchodu provozovaného společností {sellerName}. Odesláním objednávky kupující potvrzuje, že se s těmito VOP seznámil a souhlasí s nimi.",
    sections: [
      {
        heading: "1. Prodávající a kupující",
        body: [
          "Prodávajícím je {sellerName}, IČO {ico}, DIČ {dic}, IČ DPH {icDph}, se sídlem {legalAddress}.",
          "Kupujícím je každá osoba, která prostřednictvím internetového obchodu odešle objednávku. Spotřebitelem je fyzická osoba, která při uzavření a plnění smlouvy nejedná v rámci své podnikatelské, pracovní nebo profesní činnosti.",
          "Je-li kupující spotřebitelem, vztahují se na smluvní vztah také příslušné právní předpisy na ochranu spotřebitele včetně práv, která nelze smluvně v neprospěch spotřebitele vyloučit nebo omezit.",
          "Smluvní strany uznávají elektronickou komunikaci prostřednictvím internetového obchodu a e-mailu a případně také komunikaci telefonem.",
        ],
      },
      {
        heading: "2. Ceny",
        body: [
          "Ceny zboží jsou konečné a zahrnují DPH ve výši použitelné na konkrétní prodej podle platných daňových předpisů, není-li u konkrétního zboží uvedeno jinak.",
          "Konečná cena objednávky včetně případných nákladů na dopravu a dalších poplatků je kupujícímu zobrazena před závazným odesláním objednávky.",
          "Prodávající je vázán cenou zobrazenou kupujícímu v okamžiku odeslání objednávky, s výjimkou zjevné technické chyby.",
          "Je-li zboží označeno jako zlevněné, informace o předchozí ceně a slevě se uvádějí v souladu s platnými pravidly ochrany spotřebitele.",
          "V případě zjevně nesprávné ceny způsobené technickou nebo obdobnou chybou prodávající kupujícího bez zbytečného odkladu informuje a navrhne další postup nebo správnou cenu. Kupující není povinen změněnou cenu přijmout.",
        ],
      },
      {
        heading: "3. Objednávka a uzavření kupní smlouvy",
        body: [
          "Objednávku lze prostřednictvím internetového obchodu zpravidla vytvořit bez registrace, pokud internetový obchod u konkrétního nákupu neuvádí jinak.",
          "Před odesláním objednávky má kupující možnost zkontrolovat a opravit zadané údaje, vybrané zboží a množství, způsob dopravy a platby a celkovou cenu objednávky.",
          "Odesláním objednávky kupující potvrzuje objednávku a přijímá povinnost zaplatit uvedenou cenu.",
          "Tlačítko pro závazné odeslání objednávky je označeno tak, aby bylo zřejmé, že jeho použitím vzniká povinnost platby.",
          "Kupní smlouva vzniká potvrzením objednávky prodávajícím prostřednictvím e-mailu. Objednávku lze změnit nebo zrušit dohodou kupujícího a prodávajícího, pokud právní předpisy nebo tyto VOP nestanoví jinak.",
        ],
      },
      {
        heading: "4. Platba a dodání",
        body: [
          "Aktuálně dostupné způsoby platby a dopravy, jejich ceny a případná omezení jsou kupujícímu zobrazeny v pokladně podle zvolené země doručení a aktuální nabídky internetového obchodu.",
          "Podrobnější informace jsou uvedeny na stránce [[shipping|Doprava a platba]].",
          "Dodací lhůta závisí zejména na dostupnosti rostlin, sezóně, povaze objednaného zboží, zemi doručení a zvoleném způsobu dopravy.",
          "Je-li zboží nabízeno formou předobjednávky nebo s pozdějším termínem dostupnosti, příslušná informace je uvedena u zboží nebo v objednávce.",
          "Při dodání spotřebiteli přechází nebezpečí ztráty nebo poškození zboží na spotřebitele zpravidla v okamžiku, kdy spotřebitel nebo jím určená třetí osoba zboží převezme, pokud použitelné právní předpisy nestanoví jinak.",
          "Při viditelném poškození zásilky doporučujeme poškození zdokumentovat, pokud je to možné oznámit dopravci a bez zbytečného odkladu kontaktovat prodávajícího.",
        ],
      },
      {
        heading: "5. Odstoupení spotřebitele od smlouvy",
        body: [
          "U smlouvy uzavřené na dálku má spotřebitel právo odstoupit od smlouvy v zákonné lhůtě, zpravidla do 14 dnů od převzetí zboží, pokud se na konkrétní případ nevztahuje zákonná výjimka.",
          "U živých rostlin, zboží podléhajícího rychlé zkáze nebo rychlému snížení jakosti a v dalších zákonem stanovených případech může být právo na odstoupení omezeno nebo vyloučeno.",
          "Podrobné informace o právu na odstoupení, výjimkách, lhůtách a postupu při vrácení zboží jsou uvedeny na stránce [[returns|Vrácení zboží a odstoupení od smlouvy]].",
          "Zjistí-li kupující poškození při přepravě nebo nesoulad dodaného zboží s objednávkou, doporučujeme co nejdříve kontaktovat prodávajícího a podle možností přiložit fotodokumentaci. Toto doporučení neomezuje zákonná práva spotřebitele z vadného plnění.",
          "Vzorový formulář pro odstoupení je k dispozici na stránce Vrácení zboží. Zboží se vrací na adresu uvedenou prodávajícím, pokud se prodávající a kupující nedohodnou jinak.",
        ],
      },
      {
        heading: "6. Rostlinolékařské pasy a fytosanitární povinnosti",
        body: [
          "Na přemisťování rostlin v rámci Evropské unie se vztahují příslušné právní předpisy EU v oblasti zdraví rostlin, zejména nařízení (EU) 2016/2031 a související prováděcí předpisy včetně nařízení (EU) 2019/2072.",
          "Rostliny, u nichž je vyžadován rostlinolékařský pas, jsou označeny v souladu s příslušnými právními předpisy. Rostlinolékařský pas mimo jiné umožňuje zpětnou dohledatelnost rostlin v dodavatelském řetězci.",
          "Prodávající plní povinnosti profesionálního provozovatele související s internetovým prodejem rostlin a příslušné fytosanitární požadavky.",
          "Informace příslušného slovenského orgánu ÚKSÚP o internetovém prodeji rostlin jsou dostupné na jeho oficiálních webových stránkách.",
          "Na dovoz nebo přemisťování rostlin ze třetích zemí se mohou vztahovat zvláštní zákazy, omezení a fytosanitární požadavky.",
        ],
      },
      {
        heading: "7. Reklamace a odpovědnost za vady",
        body: [
          "Prodávající odpovídá za vady zboží v rozsahu stanoveném použitelnými právními předpisy.",
          "Při posuzování stavu živých rostlin se zohledňuje jejich přirozená biologická povaha. Prodávající neodpovídá za poškození nebo úhyn rostliny způsobené po jejím převzetí okolnostmi na straně kupujícího, zejména nesprávnou péčí, nevhodnou výsadbou, mrazem, vyschnutím, přemokřením nebo mechanickým poškozením, pokud za takovou okolnost podle použitelných právních předpisů neodpovídá.",
          "Reklamaci lze uplatnit prostřednictvím kontaktních údajů prodávajícího, zejména e-mailem na {supportEmail}. Pro rychlejší vyřízení doporučujeme uvést číslo objednávky, popis problému a podle povahy vady přiložit fotografie.",
          "Tato doporučení týkající se způsobu uplatnění reklamace neomezují zákonná práva spotřebitele.",
        ],
      },
      {
        heading: "8. Ochrana osobních údajů a rozhodné právo",
        body: [
          "Informace o zpracování osobních údajů jsou uvedeny v samostatném dokumentu [[privacy|Zásady ochrany osobních údajů]].",
          "Smluvní vztahy mezi prodávajícím a kupujícím se řídí právem Slovenské republiky.",
          "Je-li kupující spotřebitelem s obvyklým pobytem v jiném členském státě Evropské unie, volba slovenského práva jej nezbavuje ochrany poskytované kogentními ustanoveními práva země jeho obvyklého pobytu, od nichž se podle příslušných pravidel EU nelze smluvně odchýlit.",
          "Spotřebitel má právo obrátit se na prodávajícího se žádostí o nápravu. Nelze-li spor vyřešit dohodou, může spotřebitel využít příslušné možnosti alternativního řešení spotřebitelských sporů podle platných právních předpisů.",
          "Tyto VOP jsou součástí kupní smlouvy ve znění platném a zveřejněném v okamžiku odeslání objednávky. Číslo a datum revize dokumentu jsou uvedeny na této stránce.",
        ],
      },
      {
        heading: "9. Dozorové orgány a řešení sporů",
        body: [
          "Prodávající podléhá podle povahy své činnosti dozoru příslušných orgánů Slovenské republiky.",
          "V oblasti ochrany spotřebitele je příslušným orgánem zejména Slovenská obchodní inspekce (SOI).",
          "V oblasti rostlinolékařské a fytosanitární kontroly je příslušným orgánem Ústřední kontrolní a zkušební ústav zemědělský v Bratislavě (ÚKSÚP).",
          "Má-li spotřebitel obvyklý pobyt v jiném členském státě Evropské unie, může mít podle použitelných právních předpisů právo obrátit se také na příslušné orgány nebo subjekty pro řešení spotřebitelských sporů ve své zemi.",
        ],
      },
      {
        heading: "10. Kontaktní údaje",
        body: [
          "Prodávající: {sellerName}, sídlo {legalAddress}.",
          "E-mail: {supportEmail}.",
          "Telefon a další aktuální kontaktní údaje jsou uvedeny na stránce [[contacts|Kontakty]].",
        ],
      },
    ],
  },
  {
    type: 'TERMS',
    locale: 'uk',
    title: "Загальні умови продажу",
    intro: "Ці Загальні умови продажу («Умови») регулюють придбання товарів через інтернет-магазин, оператором якого є {sellerName}. Надсилаючи замовлення, покупець підтверджує, що ознайомився з цими Умовами та погоджується з ними.",
    sections: [
      {
        heading: "1. Продавець і покупець",
        body: [
          "Продавцем є {sellerName}, реєстраційний номер компанії {ico}, податковий номер {dic}, номер платника ПДВ {icDph}, юридична адреса: {legalAddress}.",
          "Покупцем є будь-яка особа, яка оформлює замовлення через інтернет-магазин. Споживачем є фізична особа, яка під час укладення та виконання договору не діє в межах своєї підприємницької, трудової або професійної діяльності.",
          "Якщо покупець є споживачем, до договірних відносин також застосовуються відповідні норми законодавства про захист прав споживачів, включно з правами, які не можуть бути виключені або обмежені договором на шкоду споживачеві.",
          "Сторони визнають електронну комунікацію через інтернет-магазин та електронну пошту, а за потреби — також телефонний зв'язок.",
        ],
      },
      {
        heading: "2. Ціни",
        body: [
          "Ціни на товари є кінцевими та включають ПДВ за ставкою, що застосовується до конкретного продажу відповідно до чинних податкових правил, якщо для конкретного товару не зазначено інше.",
          "Остаточна сума замовлення, включно з можливими витратами на доставку та іншими платежами, відображається покупцеві до обов'язкового оформлення замовлення.",
          "Продавець зобов'язаний дотримуватися ціни, показаної покупцеві на момент надсилання замовлення, за винятком випадку очевидної технічної помилки.",
          "Якщо товар продається зі знижкою, інформація про попередню ціну та розмір знижки відображається відповідно до чинних правил захисту прав споживачів.",
          "У разі відображення очевидно неправильної ціни внаслідок технічної або подібної помилки продавець без невиправданої затримки інформує покупця та пропонує подальший порядок дій або правильну ціну. Покупець не зобов'язаний погоджуватися зі зміненою ціною.",
        ],
      },
      {
        heading: "3. Замовлення та укладення договору купівлі-продажу",
        body: [
          "Замовлення, як правило, можна оформити через інтернет-магазин без реєстрації, якщо для конкретної покупки не зазначено інше.",
          "Перед надсиланням замовлення покупець має можливість перевірити та виправити введені дані, вибрані товари та їх кількість, спосіб доставки й оплати, а також загальну суму замовлення.",
          "Надсилаючи замовлення, покупець підтверджує його та бере на себе обов'язок сплатити зазначену ціну.",
          "Кнопка для остаточного надсилання замовлення позначена таким чином, щоб покупцеві було зрозуміло, що надсилання замовлення створює обов'язок оплати.",
          "Договір купівлі-продажу вважається укладеним після підтвердження замовлення продавцем електронною поштою. Зміна або скасування замовлення можливі за домовленістю між покупцем і продавцем, якщо законодавство або ці Умови не передбачають іншого.",
        ],
      },
      {
        heading: "4. Оплата і доставка",
        body: [
          "Доступні способи оплати та доставки, їх вартість і можливі обмеження відображаються під час оформлення замовлення відповідно до обраної країни доставки та актуальної пропозиції інтернет-магазину.",
          "Детальна інформація наведена на сторінці [[shipping|Доставка та оплата]].",
          "Строк доставки залежить, зокрема, від наявності рослин, сезону, характеру замовлених товарів, країни доставки та обраного способу доставки.",
          "Якщо товар пропонується за попереднім замовленням або з пізнішою датою доступності, відповідна інформація зазначається біля товару або в замовленні.",
          "У разі доставки споживачеві ризик втрати або пошкодження товару, як правило, переходить до споживача в момент, коли споживач або визначена ним третя особа отримує товар, якщо чинне законодавство не передбачає іншого.",
          "У разі видимого пошкодження відправлення рекомендуємо зафіксувати пошкодження, за можливості повідомити перевізника та без невиправданої затримки звернутися до продавця.",
        ],
      },
      {
        heading: "5. Право споживача на відмову від договору",
        body: [
          "У разі договору, укладеного дистанційно, споживач має право відмовитися від договору протягом встановленого законом строку, як правило, протягом 14 днів із моменту отримання товару, якщо не застосовується передбачений законом виняток.",
          "Для живих рослин, товарів, що швидко псуються або швидко втрачають якість, а також в інших передбачених законом випадках право на відмову може бути обмежене або виключене.",
          "Детальна інформація про право на відмову, винятки, строки та порядок повернення товару наведена на сторінці [[returns|Повернення товару та відмова від договору]].",
          "Якщо покупець виявив пошкодження під час перевезення або невідповідність доставленого товару замовленню, рекомендуємо якнайшвидше звернутися до продавця та, за можливості, додати фотоматеріали. Ця рекомендація не обмежує законних прав споживача у зв'язку з неналежним виконанням договору.",
          "Зразок форми відмови від договору доступний на сторінці Повернення товару. Товар слід повернути на адресу, зазначену продавцем, якщо продавець і покупець не домовилися про інше.",
        ],
      },
      {
        heading: "6. Паспорти рослин і фітосанітарні вимоги",
        body: [
          "Переміщення рослин у межах Європейського Союзу регулюється відповідним законодавством ЄС у сфері здоров'я рослин, зокрема Регламентом (ЄС) 2016/2031 та пов'язаними виконавчими актами, включно з Регламентом (ЄС) 2019/2072.",
          "Рослини, для яких потрібен паспорт рослини, маркуються відповідно до чинних вимог. Паспорт рослини, зокрема, забезпечує можливість простежуваності рослини в ланцюгу постачання.",
          "Продавець виконує обов'язки професійного оператора, що застосовуються до інтернет-продажу рослин, та відповідні фітосанітарні вимоги.",
          "Інформація компетентного словацького органу ÚKSÚP щодо інтернет-продажу рослин доступна на його офіційному вебсайті.",
          "Для ввезення або переміщення рослин із третіх країн можуть застосовуватися спеціальні заборони, обмеження та фітосанітарні вимоги.",
        ],
      },
      {
        heading: "7. Рекламації та відповідальність за недоліки",
        body: [
          "Продавець відповідає за недоліки товару в обсязі, передбаченому чинним законодавством.",
          "Під час оцінки стану живих рослин враховуються їх природні біологічні властивості. Продавець не відповідає за пошкодження або загибель рослини після її отримання, спричинені обставинами на стороні покупця, зокрема неналежним доглядом, неправильною посадкою, морозом, пересиханням, надмірним зволоженням або механічним пошкодженням, якщо відповідно до законодавства продавець не несе відповідальності за такі обставини.",
          "Рекламацію можна подати за контактними даними продавця, зокрема електронною поштою на {supportEmail}. Для швидшого розгляду рекомендуємо зазначити номер замовлення, опис проблеми та, залежно від характеру недоліку, додати фотографії.",
          "Ці рекомендації щодо способу подання рекламації не обмежують законних прав споживача.",
        ],
      },
      {
        heading: "8. Персональні дані та застосовне право",
        body: [
          "Інформація про обробку персональних даних наведена в окремому документі [[privacy|Політика конфіденційності]].",
          "Договірні відносини між продавцем і покупцем регулюються правом Словацької Республіки.",
          "Якщо покупець є споживачем, звичайне місце проживання якого знаходиться в іншій державі-члені Європейського Союзу, вибір словацького права не позбавляє його захисту, що надається обов'язковими положеннями права країни його звичайного місця проживання, від яких відповідно до застосовних правил ЄС не можна відступити за домовленістю сторін.",
          "Споживач має право звернутися до продавця з вимогою про усунення порушення. Якщо спір не може бути вирішений за домовленістю, споживач може скористатися відповідними механізмами альтернативного вирішення споживчих спорів згідно з чинним законодавством.",
          "Ці Умови є частиною договору купівлі-продажу в редакції, чинній і опублікованій на момент надсилання замовлення. Номер і дата редакції документа зазначаються на цій сторінці.",
        ],
      },
      {
        heading: "9. Органи нагляду та вирішення спорів",
        body: [
          "Продавець залежно від характеру своєї діяльності перебуває під наглядом відповідних органів Словацької Республіки.",
          "У сфері захисту прав споживачів відповідним органом є, зокрема, Словацька торговельна інспекція (SOI).",
          "У сфері фітосанітарного контролю та здоров'я рослин відповідним органом є Центральний контрольний і випробувальний інститут сільського господарства в Братиславі (ÚKSÚP).",
          "Якщо споживач має звичайне місце проживання в іншій державі-члені Європейського Союзу, відповідно до застосовного законодавства він також може мати право звернутися до компетентних органів або органів вирішення споживчих спорів у своїй країні.",
        ],
      },
      {
        heading: "10. Контактні дані",
        body: [
          "Продавець: {sellerName}, юридична адреса: {legalAddress}.",
          "Електронна пошта: {supportEmail}.",
          "Номер телефону та інші актуальні контактні дані наведені на сторінці [[contacts|Контакти]].",
        ],
      },
    ],
  },
]

