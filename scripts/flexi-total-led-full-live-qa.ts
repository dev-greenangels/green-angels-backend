/**
 * One-shot FULL LIVE QA for Flexi total-led discounts (max 3 OBPs).
 * Do not commit; delete or ignore after run.
 */
import { PrismaClient } from '@prisma/client'
import { decryptSecret, resolveFlexiSecretsKey } from '../src/flexi/flexi.crypto'
import { FLEXI_SETTINGS_KEY } from '../src/flexi/flexi.constants'
import {
  buildFlexiCatalogProductLine,
  buildFlexiCatalogProductLineTotalLed,
  buildFlexiAncillaryExportLines,
  shouldExportFlexiPercentTotalLed,
  assertFlexiCommercialTotalParity,
  resolveFlexiLineVatFields,
  resolveFlexiTypCenyDphK,
  resolveOrderFlexiRepresentedTotal,
} from '../src/flexi/flexi-order-export-mapping'
import { buildFlexiLineDiscountSnapshot } from '../src/pricing/flexi-line-discount-snapshot'
import { unitPriceFromBasePercent } from '../src/pricing/percent-stack'
import { roundMoney } from '../src/pricing/pricing.helpers'

const prisma = new PrismaClient()

type AnyRec = Record<string, unknown>

async function main() {
  const REPORT: AnyRec = { scenarios: [], created: [], stopped: null }
  const key = resolveFlexiSecretsKey() || ''
  const row = await prisma.settings.findUnique({ where: { key: FLEXI_SETTINGS_KEY } })
  const stored =
    typeof row?.value === 'string'
      ? (JSON.parse(row.value as string) as AnyRec)
      : ((row?.value as AnyRec) ?? {})
  const baseUrl = String(stored.baseUrl || '').replace(/\/$/, '')
  const companyId = String(stored.companyId || '')
  const username = String(stored.username || '')
  let password = String(stored.password || '')
  if (password.startsWith('enc:v1:') && key) password = decryptSecret(password, key)
  const headers = {
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const stock = String(stored.defaultStockCode || 'WHMAIN').trim()
  const center = String(stored.centerCode || '').trim()

  async function get(path: string) {
    const res = await fetch(`${baseUrl}/c/${encodeURIComponent(companyId)}${path}`, {
      headers,
    })
    return { status: res.status, json: (await res.json().catch(() => null)) as AnyRec | null }
  }
  async function put(path: string, body: unknown) {
    const res = await fetch(`${baseUrl}/c/${encodeURIComponent(companyId)}${path}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    })
    return { status: res.status, json: (await res.json().catch(() => null)) as AnyRec | null }
  }

  function applyVat(line: AnyRec, taxRegime: string, taxRate: number) {
    line.typCenyDphK = resolveFlexiTypCenyDphK(taxRegime)
    const vat = resolveFlexiLineVatFields({ taxRegime, taxRatePercent: taxRate })
    if (vat.szbDph != null) line.szbDph = vat.szbDph
    if (vat.typSzbDph) line.typSzbDph = vat.typSzbDph
  }

  function baseDoc(
    extId: string,
    lines: AnyRec[],
    taxRegime: string,
    taxRate: number,
  ) {
    const doc: AnyRec = {
      id: extId,
      typDokl: `code:${stored.orderDocTypeCode}`,
      bezPolozek: false,
      nazFirmy: 'TEST — FLEXI DISCOUNT QA — DO NOT PROCESS',
      popis: 'TEST — FLEXI DISCOUNT QA — DO NOT PROCESS',
      poznam: `API LIVE QA ${extId}. DO NOT PROCESS/INVOICE/SHIP. rezervovat=false.`,
      formaUhradyCis: 'code:DOBIERKA',
      mena: 'code:EUR',
      typCenyDphK: resolveFlexiTypCenyDphK(taxRegime),
      stat: 'code:SK',
      statDph: 'code:SK',
      datVyst: new Date().toISOString().slice(0, 10),
      polozkyDokladu: lines.map((l) => {
        const copy = { ...l }
        applyVat(copy, taxRegime, taxRate)
        copy.sklad = `code:${stock}`
        copy.rezervovat = false
        copy.rezervovatMj = 0
        return copy
      }),
    }
    if (center) doc.stredisko = `code:${center}`
    return { winstrom: { '@version': '1.0', 'objednavka-prijata': [doc] } }
  }

  async function ensureAbsent(extId: string) {
    const r = await get(`/objednavka-prijata/${encodeURIComponent(extId)}.json?detail=custom:kod`)
    return r.status === 404
  }

  async function dryThenLive(
    name: string,
    extId: string,
    body: AnyRec,
    expected: AnyRec,
  ): Promise<boolean> {
    const scenario: AnyRec = { name, extId, expected, dryRun: null, live: null, get: null }
    if (!(await ensureAbsent(extId))) {
      scenario.error = 'ext id already exists — abort scenario'
      ;(REPORT.scenarios as AnyRec[]).push(scenario)
      REPORT.stopped = `duplicate ${extId}`
      return false
    }
    const dry = await put(
      '/objednavka-prijata.json?dry-run=true&fail-on-warning=true',
      body,
    )
    const w = dry.json?.winstrom as AnyRec | undefined
    scenario.dryRun = {
      status: dry.status,
      success: w?.success,
      stats: w?.stats,
      results: w?.results,
    }
    const stillAbsent = await ensureAbsent(extId)
    ;(scenario.dryRun as AnyRec).stillAbsent = stillAbsent
    if (String(w?.success) !== 'true') {
      ;(REPORT.scenarios as AnyRec[]).push(scenario)
      REPORT.stopped = `${name} dry-run failed`
      return false
    }
    if (!stillAbsent) {
      scenario.error = 'dry-run unexpectedly persisted'
      ;(REPORT.scenarios as AnyRec[]).push(scenario)
      REPORT.stopped = 'dry-run persisted'
      return false
    }
    const live = await put('/objednavka-prijata.json', body)
    const lw = live.json?.winstrom as AnyRec | undefined
    scenario.live = {
      status: live.status,
      success: lw?.success,
      stats: lw?.stats,
      results: lw?.results,
    }
    const got = await get(
      `/objednavka-prijata/${encodeURIComponent(extId)}.json?detail=custom:kod,nazFirmy,popis,sumCelkem,sumZkl,sumDph,sumZklZakl,sumDphZakl,sumCelkZakl,sumOsv,formaUhradyCis,mena,typDokl,typCenyDphK,polozkyDokladu(cenik,nazev,cenaMj,mnozMj,slevaPol,typCenyDphK,szbDph,typSzbDphK,sumZkl,sumDph,sumCelkem,sklad,rezervovat,rezervovatMj,rezervovano)`,
    )
    const doc = (got.json?.winstrom as AnyRec | undefined)?.['objednavka-prijata']
    const item = Array.isArray(doc) ? doc[0] : doc
    scenario.get = { status: got.status, doc: item }
    ;(REPORT.scenarios as AnyRec[]).push(scenario)
    if (String(lw?.success) === 'true' && item && (item as AnyRec).kod) {
      ;(REPORT.created as AnyRec[]).push({ name, extId, kod: (item as AnyRec).kod })
      return true
    }
    REPORT.stopped = `${name} live failed`
    return false
  }

  for (const sku of ['PLANT666', 'PLANT663', 'PLANT676']) {
    const c = await get(`/cenik/code:${sku}.json?detail=custom:kod,nazev,skladove,szbDph`)
    const ci = (c.json?.winstrom as AnyRec | undefined)?.cenik
    const item = Array.isArray(ci) ? ci[0] : ci
    REPORT[`cenik_${sku}`] = {
      status: c.status,
      kod: (item as AnyRec | undefined)?.kod,
      skladove: (item as AnyRec | undefined)?.skladove,
      szbDph: (item as AnyRec | undefined)?.szbDph,
    }
  }

  // T1 B2C
  {
    const base = 3.99
    const pct = 10
    const qty = 40
    const payable = unitPriceFromBasePercent(base, pct)
    const snap = buildFlexiLineDiscountSnapshot({
      baseUnitPrice: base,
      unitPrice: payable,
      quantity: qty,
      appliedPercentSum: pct,
      taxRegime: 'seller',
      taxIncluded: true,
    })
    const use = shouldExportFlexiPercentTotalLed({
      taxRegime: 'seller',
      flexiSlevaPol: snap.flexiSlevaPol,
      commercialBaseUnitPrice: snap.commercialBaseUnitPrice,
      commercialLineAmount: snap.commercialLineAmount,
    })
    const productLine = buildFlexiCatalogProductLineTotalLed({
      sku: 'PLANT666',
      quantity: qty,
      slevaPol: snap.flexiSlevaPol!,
      sumCelkem: snap.commercialLineAmount,
    })
    const parity = assertFlexiCommercialTotalParity({
      lines: [productLine],
      expectedTotal: snap.commercialLineAmount,
    })
    const extId = 'ext:GA-LIVE-QA:B2C-20261020-001'
    const body = baseDoc(extId, [productLine as AnyRec], 'seller', 23)
    REPORT.t1_local = {
      useTotalLed: use,
      snap,
      productLine,
      parity,
      hasCenaMj: 'cenaMj' in productLine,
    }
    const ok = await dryThenLive('T1_B2C', extId, body, {
      sumCelkem: 143.6,
      slevaPol: 10,
      mnozMj: 40,
    })
    if (!ok) {
      console.log(JSON.stringify(REPORT, null, 2))
      return
    }
  }

  // T2 Wholesale
  {
    const wholesaleBase = 3.5
    const promoPct = 10
    const qtyPromo = 5
    const payablePromo = unitPriceFromBasePercent(wholesaleBase, promoPct)
    const snapPromo = buildFlexiLineDiscountSnapshot({
      baseUnitPrice: wholesaleBase,
      unitPrice: payablePromo,
      quantity: qtyPromo,
      appliedPercentSum: promoPct,
      taxRegime: 'seller',
      taxIncluded: true,
    })
    const linePromo = shouldExportFlexiPercentTotalLed({
      taxRegime: 'seller',
      flexiSlevaPol: snapPromo.flexiSlevaPol,
      commercialBaseUnitPrice: snapPromo.commercialBaseUnitPrice,
      commercialLineAmount: snapPromo.commercialLineAmount,
    })
      ? buildFlexiCatalogProductLineTotalLed({
          sku: 'PLANT676',
          quantity: qtyPromo,
          slevaPol: snapPromo.flexiSlevaPol!,
          sumCelkem: snapPromo.commercialLineAmount,
        })
      : buildFlexiCatalogProductLine({
          sku: 'PLANT676',
          quantity: qtyPromo,
          cenaMj: snapPromo.commercialUnitPrice,
        })

    const noDiscUnit = 3.99
    const noDiscQty = 2
    const linePlain = buildFlexiCatalogProductLine({
      sku: 'PLANT663',
      quantity: noDiscQty,
      cenaMj: noDiscUnit,
    })

    const delivery = 26.73
    const cod = 1.23
    const fees = buildFlexiAncillaryExportLines({
      deliveryAmount: delivery,
      packagingAmount: 0,
      packagingBoxCount: 0,
      codFeeAmount: cod,
      shippingCenikKod: String(stored.shippingCenikKod || 'SHIPPING'),
      boxesCenikKod: String(stored.boxesCenikKod || 'BOXES'),
    })

    const productSub = roundMoney(
      snapPromo.commercialLineAmount + roundMoney(noDiscUnit * noDiscQty),
    )
    const expected = resolveOrderFlexiRepresentedTotal({
      productsSubtotal: productSub,
      deliveryAmount: delivery,
      packagingAmount: 0,
      codFeeAmount: cod,
    })
    const parityLines = [
      linePromo as AnyRec,
      linePlain,
      ...fees.map((f) => ({ cenaMj: f.cenaMj, mnozMj: f.mnozMj })),
    ]
    const parity = assertFlexiCommercialTotalParity({
      lines: parityLines as never,
      expectedTotal: expected,
    })

    const extId = 'ext:GA-LIVE-QA:WHOLESALE-20261020-001'
    const bodyObj = baseDoc(extId, [linePromo as AnyRec, linePlain as AnyRec], 'seller', 23)
    const doc = (bodyObj.winstrom as AnyRec)['objednavka-prijata'] as AnyRec[]
    const head = doc[0]
    for (const fee of fees) {
      const fl: AnyRec = {
        cenik: fee.cenik,
        mnozMj: fee.mnozMj,
        cenaMj: fee.cenaMj,
        nazev: fee.nazev,
        rezervovat: false,
        rezervovatMj: 0,
      }
      applyVat(fl, 'seller', 23)
      ;(head.polozkyDokladu as AnyRec[]).push(fl)
    }

    REPORT.t2_local = {
      wholesaleBase,
      snapPromo,
      linePromo,
      linePlain,
      fees,
      productSub,
      expected,
      parity,
      note: 'Wholesale GROUP base 3.50 NOT as slevaPol; promo 10% is slevaPol total-led',
    }

    const ok = await dryThenLive('T2_WHOLESALE', extId, bodyObj, {
      productSub,
      expectedDoc: expected,
    })
    if (!ok) {
      console.log(JSON.stringify(REPORT, null, 2))
      return
    }
  }

  // T3 RC
  {
    const catalogBase = 3.99
    const pct = 10
    const qty = 40
    const payableGross = unitPriceFromBasePercent(catalogBase, pct)
    const snap = buildFlexiLineDiscountSnapshot({
      baseUnitPrice: catalogBase,
      unitPrice: payableGross,
      quantity: qty,
      appliedPercentSum: pct,
      taxRegime: 'reverse_charge',
      taxIncluded: true,
      stripVatRatePercent: 23,
    })
    const sumZkl = snap.commercialLineAmount
    const rcLine: AnyRec = {
      cenik: 'code:PLANT666',
      mnozMj: qty,
      slevaPol: snap.flexiSlevaPol ?? pct,
      sumZkl,
      'sumZkl-previousValue': '0',
    }
    if (snap.flexiSlevaPol == null) {
      REPORT.t3_note =
        'Snapshot null flexiSlevaPol for RC; dry-run still tests sumZkl+previousValue+slevaPol'
    }

    const extId = 'ext:GA-LIVE-QA:RC-20261020-001'
    const body = baseDoc(extId, [rcLine], 'reverse_charge', 0)

    REPORT.t3_local = {
      snap,
      payableGross,
      netLine: sumZkl,
      proposedLine: rcLine,
      typCeny: resolveFlexiTypCenyDphK('reverse_charge'),
      vatFields: resolveFlexiLineVatFields({
        taxRegime: 'reverse_charge',
        taxRatePercent: 0,
      }),
      shouldTotalLedB2CHelper: shouldExportFlexiPercentTotalLed({
        taxRegime: 'reverse_charge',
        flexiSlevaPol: pct,
        commercialBaseUnitPrice: snap.commercialBaseUnitPrice,
        commercialLineAmount: snap.commercialLineAmount,
      }),
    }

    if (!(await ensureAbsent(extId))) {
      REPORT.stopped = 'RC ext exists'
      console.log(JSON.stringify(REPORT, null, 2))
      return
    }
    const dry = await put(
      '/objednavka-prijata.json?dry-run=true&fail-on-warning=true',
      body,
    )
    const dw = dry.json?.winstrom as AnyRec | undefined
    const dryOk = String(dw?.success) === 'true'
    const scenario: AnyRec = {
      name: 'T3_RC',
      extId,
      dryRun: {
        status: dry.status,
        success: dw?.success,
        stats: dw?.stats,
        results: dw?.results,
      },
      live: null,
      get: null,
    }

    if (!dryOk) {
      scenario.rcTotalLedConfirmed = false
      ;(REPORT.scenarios as AnyRec[]).push(scenario)
      REPORT.t3_result = 'DRY_RUN_FAILED — no LIVE RC create; mapper RC T1 not implemented'
      console.log(JSON.stringify(REPORT, null, 2))
      return
    }

    const stillAbsent = await ensureAbsent(extId)
    if (!stillAbsent) {
      scenario.error = 'dry-run persisted RC'
      ;(REPORT.scenarios as AnyRec[]).push(scenario)
      console.log(JSON.stringify(REPORT, null, 2))
      return
    }
    const live = await put('/objednavka-prijata.json', body)
    const lw = live.json?.winstrom as AnyRec | undefined
    scenario.live = {
      status: live.status,
      success: lw?.success,
      stats: lw?.stats,
      results: lw?.results,
    }
    const got = await get(
      `/objednavka-prijata/${encodeURIComponent(extId)}.json?detail=custom:kod,nazFirmy,sumCelkem,sumZkl,sumDph,sumZklZakl,sumDphZakl,sumCelkZakl,sumOsv,formaUhradyCis,typCenyDphK,polozkyDokladu(cenik,cenaMj,mnozMj,slevaPol,typCenyDphK,szbDph,typSzbDphK,sumZkl,sumDph,sumCelkem,rezervovat,rezervovatMj,rezervovano)`,
    )
    const doc = (got.json?.winstrom as AnyRec | undefined)?.['objednavka-prijata']
    const item = Array.isArray(doc) ? doc[0] : doc
    scenario.get = { status: got.status, doc: item }
    const line0 = Array.isArray((item as AnyRec | undefined)?.polozkyDokladu)
      ? ((item as AnyRec).polozkyDokladu as AnyRec[])[0]
      : ((item as AnyRec | undefined)?.polozkyDokladu as AnyRec | undefined)
    const gotZkl = Number(line0?.sumZkl ?? (item as AnyRec | undefined)?.sumZkl)
    scenario.rcTotalLedConfirmed =
      String(lw?.success) === 'true' &&
      !!item &&
      Math.abs(gotZkl - Number(sumZkl)) < 0.005
    ;(REPORT.scenarios as AnyRec[]).push(scenario)
    if (scenario.rcTotalLedConfirmed) {
      ;(REPORT.created as AnyRec[]).push({
        name: 'T3_RC',
        extId,
        kod: (item as AnyRec).kod,
      })
      REPORT.t3_result = 'LIVE_OK — implement RC total-led in mapper'
    } else {
      REPORT.t3_result = 'LIVE_OR_GET_MISMATCH — do not implement'
      REPORT.stopped = 'T3 mismatch'
    }
  }

  console.log(JSON.stringify(REPORT, null, 2))
}

main()
  .catch((e) => {
    console.error(String(e))
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
