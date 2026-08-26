import { Injectable, Logger } from '@nestjs/common'

import {
  FLEXI_API_WARN_THRESHOLD,
  FLEXI_CENIK_QUERY_BATCH,
  FLEXI_HTTP_TIMEOUT_MS,
  FLEXI_STOCK_FILTER_CHUNK,
} from './flexi.constants'
import { FlexiSettingsService } from './flexi.settings.service'
import { parseStromLocaleFields } from './flexi-locale-json'
import { applyWarehouseStock } from './flexi-warehouse-stock'
import type {
  FlexiCenikItem,
  FlexiSettings,
  FlexiStromCenikLink,
  FlexiStromNode,
} from './flexi.types'

type FlexiListResponse = {
  winstrom?: Record<string, unknown>
} & Record<string, unknown>

/**
 * Cenik detail for SK sync:
 * - price: prefer including VAT (cenaZakl / cenaZaklVcDph / prodejCena), then bez DPH
 * - nomen: Intrastat Combined Nomenclature (CN)
 * - net weight=hmotMj. Do NOT copy sumDostupMj into ProductVariant.stock —
 *   warehouse qty comes from skladova-karta.dostupMj for defaultStockCode.
 */
const CENIK_DETAIL =
  'custom:id,kod,nazev,cenaZakl,cenaZaklVcDph,prodejCena,cenaZaklBezDph,sumDostupMj,sumStavMj,stavMJ,skladem,hmotMj,hmotObal,nomen'

/** Stock card: Available quantity = dostupMj (excludes pending issues). */
const SKLAD_KARTA_DETAIL = 'custom:cenik(kod),stavMJ,dostupMj,rezervovanoMj'

@Injectable()
export class FlexiClient {
  private readonly logger = new Logger(FlexiClient.name)
  private cachedPeriodId: { id: string; fetchedAt: number } | null = null

  constructor(private readonly settingsService: FlexiSettingsService) {}

  private authHeader(settings: FlexiSettings): string {
    const token = Buffer.from(`${settings.username}:${settings.password}`).toString('base64')
    return `Basic ${token}`
  }

  private companyBase(settings: FlexiSettings): string {
    return `${settings.baseUrl}/c/${encodeURIComponent(settings.companyId)}`
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    settingsOverride?: FlexiSettings,
  ): Promise<T> {
    const settings = settingsOverride ?? (await this.settingsService.getSettings())
    if (!settings.baseUrl || !settings.companyId) {
      throw new Error('ABRA Flexi не налаштовано (baseUrl / companyId).')
    }

    const url = path.startsWith('http')
      ? path
      : `${this.companyBase(settings)}${path.startsWith('/') ? path : `/${path}`}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FLEXI_HTTP_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: this.authHeader(settings),
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      void this.settingsService.incrementApiCalls(1).then((count) => {
        if (count === FLEXI_API_WARN_THRESHOLD || count === FLEXI_API_WARN_THRESHOLD + 1) {
          this.logger.warn(
            `Flexi REST API calls today ≈ ${count} (поріг попередження ${FLEXI_API_WARN_THRESHOLD}).`,
          )
        }
      })

      const text = await response.text()
      let json: unknown = null
      if (text.trim()) {
        try {
          json = JSON.parse(text)
        } catch {
          json = { raw: text }
        }
      }
      if (!response.ok) {
        const detail =
          typeof json === 'object' && json && 'winstrom' in json
            ? JSON.stringify((json as FlexiListResponse).winstrom)
            : text.slice(0, 500)
        throw new Error(`Flexi HTTP ${response.status}: ${detail || response.statusText}`)
      }
      return json as T
    } finally {
      clearTimeout(timer)
    }
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const settings = await this.settingsService.getSettings()
    try {
      await this.request('GET', '/cenik.json?limit=1&detail=id', undefined, settings)
      return { ok: true, message: 'Зʼєднання з ABRA Flexi успішне.' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Flexi testConnection failed: ${message}`)
      return { ok: false, message }
    }
  }

  async registerWebhook(
    url: string,
    secKey: string,
    lastVersion = 0,
    skipUrlTest = false,
  ): Promise<void> {
    const settings = await this.settingsService.getSettings()
    const qs = new URLSearchParams({
      url,
      format: 'JSON',
      lastVersion: String(lastVersion),
      secKey,
    })
    if (skipUrlTest) qs.set('skipUrlTest', 'true')
    await this.request('PUT', `/hooks.json?${qs.toString()}`, undefined, settings)
  }

  private asArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[]
    if (value && typeof value === 'object') return [value as T]
    return []
  }

  private extractEvidence<T>(payload: unknown, evidence: string): T[] {
    if (!payload || typeof payload !== 'object') return []
    const root = payload as FlexiListResponse
    const winstrom = root.winstrom ?? root
    return this.asArray<T>((winstrom as Record<string, unknown>)[evidence])
  }

  private num(value: unknown, fallback = 0): number {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }

  /** First finite price > 0 — Flexi often sends cenaZaklBezDph=0 while cenaZakl/prodejCena is set. */
  private firstPositiveNum(...candidates: unknown[]): number {
    for (const value of candidates) {
      if (value === null || value === undefined || value === '') continue
      const n = Number(value)
      if (Number.isFinite(n) && n > 0) return n
    }
    return 0
  }

  /** Prefer dostupMj / sumStavMj; ignore boolean skladem. */
  private parseStockQty(...candidates: unknown[]): number {
    for (const value of candidates) {
      if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
        continue
      }
      const n = Number(value)
      if (Number.isFinite(n)) return Math.max(0, Math.floor(n))
    }
    return 0
  }

  private escapeFlexiLiteral(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  }

  private extractCenikKod(cenik: unknown): string | null {
    if (typeof cenik === 'string') {
      const s = cenik.trim()
      if (s.startsWith('code:')) return s.slice(5).trim() || null
      // "code:XXX" sometimes nested; bare kod
      if (s && !/^\d+$/.test(s)) return s
      return null
    }
    if (cenik && typeof cenik === 'object') {
      const o = cenik as Record<string, unknown>
      const kod = o.kod ?? o.code
      if (kod != null && String(kod).trim()) return String(kod).trim()
      const show = o['@showAs'] ?? o.showAs
      if (typeof show === 'string' && show.includes(':')) {
        // e.g. "PENN-ALO-LADYU-C2: Name"
        return show.split(':')[0]?.trim() || null
      }
    }
    return null
  }

  /**
   * Intrastat Combined Nomenclature from cenik.nomen (relation) or string aliases.
   * Flexi often returns `code:060290` or `{ kod: "060290" }`.
   */
  private parseCnCode(row: Record<string, unknown>): string | null {
    const candidates: unknown[] = [
      row.nomen,
      row['nomen@ref'],
      row.nomenklatura,
      row.intrastatNomen,
      row.kodNomen,
      row.cnCode,
      row.nomenKod,
    ]
    for (const value of candidates) {
      const code = this.extractRelationCode(value)
      if (code) return code.replace(/\s/g, '')
    }
    return null
  }

  /** Relation / code:XXX / nested kod → bare code string. */
  private extractRelationCode(value: unknown): string | null {
    if (value == null || value === '') return null
    if (typeof value === 'string') {
      const s = value.trim()
      if (!s) return null
      if (s.startsWith('code:')) return s.slice(5).trim() || null
      // "@showAs" style "060290: Live plants…" or bare CN digits
      if (/^\d{4,}/.test(s)) return s.split(/[:\s]/)[0]?.trim() || null
      return s
    }
    if (typeof value === 'object') {
      const o = value as Record<string, unknown>
      const kod = o.kod ?? o.code ?? o.cnCode
      if (kod != null && String(kod).trim()) return String(kod).trim()
      const show = o['@showAs'] ?? o.showAs
      if (typeof show === 'string' && show.trim()) {
        const head = show.split(':')[0]?.trim()
        if (head) return head
      }
    }
    return null
  }

  /** Current accounting period id (cached ~1h). */
  async getCurrentAccountingPeriodId(): Promise<string | null> {
    const now = Date.now()
    if (this.cachedPeriodId && now - this.cachedPeriodId.fetchedAt < 60 * 60 * 1000) {
      return this.cachedPeriodId.id
    }
    try {
      const today = new Date().toISOString().slice(0, 10)
      const filter = encodeURIComponent(
        `platiOdData <= '${today}' and platiDoData >= '${today}'`,
      )
      let payload = await this.request<unknown>(
        'GET',
        `/ucetni-obdobi.json?limit=1&detail=custom:id,kod,platiOdData,platiDoData&filter=${filter}`,
      )
      let rows = this.extractEvidence<Record<string, unknown>>(payload, 'ucetni-obdobi')
      if (rows.length === 0) {
        payload = await this.request<unknown>(
          'GET',
          '/ucetni-obdobi.json?limit=0&detail=custom:id,kod,platiOdData,platiDoData',
        )
        rows = this.extractEvidence<Record<string, unknown>>(payload, 'ucetni-obdobi')
        rows = rows.filter((row) => {
          const from = String(row.platiOdData ?? '').slice(0, 10)
          const to = String(row.platiDoData ?? '').slice(0, 10)
          return (!from || from <= today) && (!to || to >= today)
        })
      }
      const id = rows[0]?.id != null ? String(rows[0].id) : null
      if (id) {
        this.cachedPeriodId = { id, fetchedAt: now }
        return id
      }
    } catch (error) {
      this.logger.warn(
        `ucetni-obdobi lookup failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    return this.cachedPeriodId?.id ?? null
  }

  parseCenikRow(row: Record<string, unknown>): FlexiCenikItem | null {
    const kod = String(row.kod ?? row.code ?? '').trim()
    if (!kod) return null
    const nazev = String(row.nazev ?? row.name ?? kod).trim() || kod
    // sumDostupMj is all-warehouse total — never write it as stock.
    // Overlay skladova-karta.dostupMj for defaultStockCode via overlayWarehouseStock.
    // SK Flexi stores gross (inc_vat): prefer including-VAT fields first.
    // cenaZakl = Prodejní cena (s DPH when typCeny.sDph); cenaZaklVcDph = explicit s DPH.
    // Do not treat explicit 0 as "present" — fall through to other Flexi price fields.
    const price = this.firstPositiveNum(
      row.cenaZakl,
      row.cenaZaklVcDph,
      row.prodejCena,
      row.cenaZaklBezDph,
      row.cenaBezDph,
      row.cenaMj,
      row.sumZkl,
    )
    const cnCode = this.parseCnCode(row)
    const weightRaw = this.num(row.hmotMj ?? row.hmotnost ?? row.hmotNetto ?? 0, NaN)
    const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : null
    const quantityPrices: FlexiCenikItem['quantityPrices'] = []
    const odberatele = this.asArray<Record<string, unknown>>(
      row.odberatele ?? row['cenik-odberatel'] ?? row.cenikOdberatel,
    )
    for (const o of odberatele) {
      const minQuantity = Math.max(1, Math.floor(this.num(o.pocetMj ?? o.minPocet ?? o.mnozMj ?? 0)))
      const percent = this.num(o.slevaProc ?? o.rabat ?? o.procento ?? 0)
      if (minQuantity > 1 && percent > 0) {
        quantityPrices.push({ minQuantity, percent })
      }
    }
    return {
      id: String(row.id ?? kod),
      kod,
      nazev,
      stock: 0,
      price,
      cnCode,
      weight,
      quantityPrices,
    }
  }

  /**
   * Single stock resolver: configured sklad dostupMj, else 0.
   * Throws on skladova-karta transport / missing accounting period so callers
   * never silently keep cenik totals.
   */
  private async overlayWarehouseStock(items: FlexiCenikItem[]): Promise<FlexiCenikItem[]> {
    if (items.length === 0) return items
    const settings = await this.settingsService.getSettings()
    const qty = new Map<string, number>()
    if (settings.defaultStockCode.trim()) {
      const fetched = await this.fetchStockFromSkladoveKarty(
        items.map((item) => item.kod),
        true,
      )
      for (const [kod, n] of fetched) qty.set(kod, n)
    }
    return applyWarehouseStock(items, qty)
  }

  private async overlayWarehouseStockMap(
    map: Map<string, FlexiCenikItem>,
    key: 'kod' | 'id',
  ): Promise<Map<string, FlexiCenikItem>> {
    const overlayed = await this.overlayWarehouseStock([...map.values()])
    const next = new Map<string, FlexiCenikItem>()
    for (const item of overlayed) {
      next.set(key === 'id' ? item.id : item.kod, item)
    }
    return next
  }

  async fetchCenikPage(start: number, limit: number): Promise<FlexiCenikItem[]> {
    const path = `/cenik.json?start=${start}&limit=${limit}&detail=${encodeURIComponent(CENIK_DETAIL)}`
    const payload = await this.request<unknown>('GET', path)
    const rows = this.extractEvidence<Record<string, unknown>>(payload, 'cenik')
    const items = rows
      .map((row) => this.parseCenikRow(row))
      .filter((x): x is FlexiCenikItem => Boolean(x))
    return this.overlayWarehouseStock(items)
  }

  async fetchCenikById(id: string): Promise<FlexiCenikItem | null> {
    const path = `/cenik/${encodeURIComponent(id)}.json?detail=${encodeURIComponent(CENIK_DETAIL)}`
    const payload = await this.request<unknown>('GET', path)
    const rows = this.extractEvidence<Record<string, unknown>>(payload, 'cenik')
    if (!rows[0]) return null
    const item = this.parseCenikRow(rows[0])
    if (!item) return null
    const [overlayed] = await this.overlayWarehouseStock([item])
    return overlayed ?? null
  }

  /**
   * ERP-WEBHOOK-002B: batch cenik by Flexi internal ids.
   * Primary: POST /cenik/query.json (FLEXI-BULK-QUERY-SPIKE).
   * Fallback: LIVE-VERIFIED GET path filter `/cenik/(id='1' or id='2').json`.
   */
  async fetchCenikByIds(ids: string[]): Promise<Map<string, FlexiCenikItem>> {
    const unique = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))]
    if (unique.length === 0) return new Map()

    try {
      return await this.fetchCenikByIdsViaQuery(unique)
    } catch (error) {
      this.logger.warn(
        `fetchCenikByIds POST /query failed, falling back to GET path-filter: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return this.fetchCenikByIdsPathFilter(unique)
    }
  }

  private async fetchCenikByIdsViaQuery(ids: string[]): Promise<Map<string, FlexiCenikItem>> {
    const result = new Map<string, FlexiCenikItem>()
    for (let i = 0; i < ids.length; i += FLEXI_CENIK_QUERY_BATCH) {
      const chunk = ids.slice(i, i + FLEXI_CENIK_QUERY_BATCH)
      const filter = chunk.map((id) => `id='${this.escapeFlexiLiteral(id)}'`).join(' or ')
      const body = {
        winstrom: {
          detail: CENIK_DETAIL,
          filter: `(${filter})`,
          limit: String(Math.max(chunk.length, FLEXI_CENIK_QUERY_BATCH)),
          'no-ext-ids': 'true',
          '@version': '1.0',
        },
      }
      const payload = await this.request<unknown>('POST', '/cenik/query.json', body)
      if (!payload || typeof payload !== 'object') {
        throw new Error('Flexi POST /cenik/query.json: malformed JSON response')
      }
      const rows = this.extractEvidence<Record<string, unknown>>(payload, 'cenik')
      for (const row of rows) {
        const item = this.parseCenikRow(row)
        if (item) result.set(item.id, item)
      }
    }
    return this.overlayWarehouseStockMap(result, 'id')
  }

  private async fetchCenikByIdsPathFilter(ids: string[]): Promise<Map<string, FlexiCenikItem>> {
    const result = new Map<string, FlexiCenikItem>()
    for (let i = 0; i < ids.length; i += FLEXI_STOCK_FILTER_CHUNK) {
      const chunk = ids.slice(i, i + FLEXI_STOCK_FILTER_CHUNK)
      const filter = chunk.map((id) => `id='${this.escapeFlexiLiteral(id)}'`).join(' or ')
      const path = `/cenik/(${encodeURIComponent(filter)}).json?limit=0&detail=${encodeURIComponent(CENIK_DETAIL)}`
      const payload = await this.request<unknown>('GET', path)
      const rows = this.extractEvidence<Record<string, unknown>>(payload, 'cenik')
      for (const row of rows) {
        const item = this.parseCenikRow(row)
        if (item) result.set(item.id, item)
      }
    }
    return this.overlayWarehouseStockMap(result, 'id')
  }

  async resolveCenikIdFromSkladovaKarta(cardId: string): Promise<string | null> {
    const path = `/skladova-karta/${encodeURIComponent(cardId)}.json?detail=custom:id,cenik,cenik(kod),dostupMj,stavMJ`
    const payload = await this.request<unknown>('GET', path)
    const rows = this.extractEvidence<Record<string, unknown>>(payload, 'skladova-karta')
    const row = rows[0]
    if (!row) return null
    const ref = row['cenik@ref']
    if (typeof ref === 'string') {
      const m = ref.match(/\/cenik\/([^/.]+)/i)
      if (m?.[1]) return decodeURIComponent(m[1])
    }
    if (typeof row.cenik === 'string' && /^\d+$/.test(row.cenik.trim())) {
      return row.cenik.trim()
    }
    return null
  }

  async listHooks(): Promise<
    Array<{ id: string; url: string; lastVersion?: number; format?: string }>
  > {
    const settings = await this.settingsService.getSettings()
    const payload = await this.request<unknown>('GET', '/hooks.json', undefined, settings)
    const rows = this.extractEvidence<Record<string, unknown>>(payload, 'hooks')
    const alt = rows.length ? rows : this.extractEvidence<Record<string, unknown>>(payload, 'hook')
    const out: Array<{ id: string; url: string; lastVersion?: number; format?: string }> = []
    for (const row of alt) {
      const id = String(row.id ?? row['@id'] ?? '').trim()
      const url = String(row.url ?? row['@url'] ?? '').trim()
      if (!id || !url) continue
      const lastVersion = this.num(row.lastVersion ?? row['@lastVersion'], 0)
      const format = String(row.format ?? row['@format'] ?? '').trim()
      out.push({
        id,
        url,
        ...(lastVersion > 0 ? { lastVersion } : {}),
        ...(format ? { format } : {}),
      })
    }
    return out
  }

  async deleteHook(hookId: string): Promise<void> {
    const settings = await this.settingsService.getSettings()
    await this.request(
      'DELETE',
      `/hooks/${encodeURIComponent(hookId)}.json`,
      undefined,
      settings,
    )
  }

  async fetchCenikByKod(kod: string): Promise<FlexiCenikItem | null> {
    const map = await this.fetchStockAndCenikBySkus([kod])
    return map.get(kod.trim()) ?? null
  }

  /**
   * Live stock: configured skladova-karta.dostupMj only.
   * Empty defaultStockCode → 0 (never cenik.sumDostupMj).
   * Throws when warehouse is set and Flexi karta / period lookup fails.
   */
  async fetchStockBySkus(skus: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>()
    const unique = [...new Set(skus.map((s) => s.trim()).filter(Boolean))]
    for (const sku of unique) result.set(sku, 0)
    if (unique.length === 0) return result

    const settings = await this.settingsService.getSettings()
    if (!settings.defaultStockCode.trim()) {
      return result
    }

    const fromCards = await this.fetchStockFromSkladoveKarty(unique, true)
    for (const [sku, qty] of fromCards) {
      result.set(sku, qty)
    }
    return result
  }

  /**
   * Checkout-only: same warehouse resolver as import/sync.
   * Empty defaultStockCode → 0 (no Flexi call).
   * Warehouse set + transport/period failure → throw so callers do not treat
   * an outage as «0 available».
   */
  async fetchStockBySkusForCheckout(skus: string[]): Promise<Map<string, number>> {
    return this.fetchStockBySkus(skus)
  }

  private async fetchStockFromSkladoveKarty(
    skus: string[],
    useConfiguredWarehouse: boolean,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>()
    const periodId = await this.getCurrentAccountingPeriodId()
    if (!periodId) {
      throw new Error('Flexi stock: немає облікового періоду (ucetni-obdobi) для skladova-karta.')
    }

    const settings = await this.settingsService.getSettings()
    const stockCode =
      useConfiguredWarehouse && settings.defaultStockCode.trim()
        ? settings.defaultStockCode.trim()
        : ''

    for (let i = 0; i < skus.length; i += FLEXI_STOCK_FILTER_CHUNK) {
      const chunk = skus.slice(i, i + FLEXI_STOCK_FILTER_CHUNK)
      const cenikOr = chunk
        .map((kod) => `cenik='code:${this.escapeFlexiLiteral(kod)}'`)
        .join(' or ')
      let filter = `ucetObdobi = ${periodId} and (${cenikOr})`
      if (stockCode) {
        filter += ` and sklad = 'code:${this.escapeFlexiLiteral(stockCode)}'`
      }

      const path =
        `/skladova-karta/(${encodeURIComponent(filter)}).json` +
        `?detail=${encodeURIComponent(SKLAD_KARTA_DETAIL)}&limit=0&no-ext-ids=true`

      const payload = await this.request<unknown>('GET', path)
      const rows = this.extractEvidence<Record<string, unknown>>(payload, 'skladova-karta')
      for (const row of rows) {
        const kod = this.extractCenikKod(row.cenik ?? row['cenik@ref'])
        if (!kod) continue
        const qty = this.parseStockQty(row.dostupMj, row.dostupMJ, row.stavMJ, row.stavMj)
        result.set(kod, (result.get(kod) ?? 0) + qty)
      }
    }
    return result
  }

  async fetchStockAndCenikBySkus(skus: string[]): Promise<Map<string, FlexiCenikItem>> {
    const result = new Map<string, FlexiCenikItem>()
    const unique = [...new Set(skus.map((s) => s.trim()).filter(Boolean))]
    if (unique.length === 0) return result

    for (let i = 0; i < unique.length; i += FLEXI_STOCK_FILTER_CHUNK) {
      const chunk = unique.slice(i, i + FLEXI_STOCK_FILTER_CHUNK)
      const filter = chunk.map((kod) => `kod='${this.escapeFlexiLiteral(kod)}'`).join(' or ')
      const path = `/cenik/(${encodeURIComponent(filter)}).json?limit=0&detail=${encodeURIComponent(CENIK_DETAIL)}`
      try {
        const payload = await this.request<unknown>('GET', path)
        const rows = this.extractEvidence<Record<string, unknown>>(payload, 'cenik')
        for (const row of rows) {
          const item = this.parseCenikRow(row)
          if (item) result.set(item.kod, item)
        }
      } catch (error) {
        this.logger.warn(
          `Batched cenik fetch failed, falling back per-SKU: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        for (const kod of chunk) {
          const filterEnc = encodeURIComponent(`kod='${this.escapeFlexiLiteral(kod)}'`)
          const single = `/cenik.json?limit=1&detail=${encodeURIComponent(CENIK_DETAIL)}&filter=${filterEnc}`
          try {
            const payload = await this.request<unknown>('GET', single)
            const rows = this.extractEvidence<Record<string, unknown>>(payload, 'cenik')
            const item = rows[0] ? this.parseCenikRow(rows[0]) : null
            if (item) result.set(item.kod, item)
          } catch {
            /* leave missing */
          }
        }
      }
    }
    return this.overlayWarehouseStockMap(result, 'kod')
  }

  async putObjednavkaPrijata(document: Record<string, unknown>): Promise<{
    nativeId: string | null
    ref: string | null
    raw: unknown
  }> {
    const payload = await this.request<unknown>('PUT', '/objednavka-prijata.json', {
      winstrom: {
        '@version': '1.0',
        'objednavka-prijata': [document],
      },
    })
    return this.parseWriteResult(payload)
  }

  /**
   * REL-003 / PRE-A: official import action (`storno` | `delete`) — id only.
   * @see https://podpora.flexibee.eu/en/articles/4725960-performing-actions
   */
  async putObjednavkaAction(
    action: 'storno' | 'delete',
    id: string,
  ): Promise<{ nativeId: string | null; ref: string | null; raw: unknown }> {
    const payload = await this.request<unknown>('PUT', '/objednavka-prijata.json', {
      winstrom: {
        '@version': '1.0',
        'objednavka-prijata': [{ '@action': action, id }],
      },
    })
    return this.parseWriteResult(payload)
  }

  /**
   * Official Flexi PUT/POST return: success + results[].id (native).
   * @see https://podpora.flexibee.eu/en/articles/4719646-return-values
   */
  parseWriteResult(payload: unknown): {
    nativeId: string | null
    ref: string | null
    raw: unknown
  } {
    const root =
      payload && typeof payload === 'object' && 'winstrom' in payload
        ? ((payload as FlexiListResponse).winstrom as Record<string, unknown>)
        : ((payload as Record<string, unknown>) ?? {})
    const successRaw = root?.success
    const success = successRaw === true || successRaw === 'true'
    if (!success) {
      const results = this.asArray<Record<string, unknown>>(root?.results ?? root?.result)
      const messages: string[] = []
      for (const row of results) {
        const errors = this.asArray<Record<string, unknown>>(row.errors ?? row.error)
        for (const err of errors) {
          const msg = String(err.message ?? err['@message'] ?? err ?? '').trim()
          if (msg) messages.push(msg)
        }
        if (typeof row.message === 'string' && row.message.trim()) {
          messages.push(row.message.trim())
        }
      }
      throw new Error(
        messages.length > 0
          ? `Flexi write failed: ${messages.join('; ')}`
          : `Flexi write failed: ${JSON.stringify(root).slice(0, 500)}`,
      )
    }
    const results = this.asArray<Record<string, unknown>>(root?.results ?? root?.result)
    const first = results[0]
    const nativeId =
      first?.id != null && String(first.id).trim() !== '' ? String(first.id).trim() : null
    const ref =
      first?.ref != null && String(first.ref).trim() !== '' ? String(first.ref).trim() : null
    return { nativeId, ref, raw: payload }
  }

  async findAdresarByExtId(extId: string): Promise<Record<string, unknown> | null> {
    const path = `/adresar/${encodeURIComponent(extId)}.json?detail=custom:id,kod,nazev,ic,dic,email`
    try {
      const payload = await this.request<unknown>('GET', path)
      const rows = this.extractEvidence<Record<string, unknown>>(payload, 'adresar')
      return rows[0] ?? null
    } catch {
      return null
    }
  }

  async findAdresarByIc(ic: string): Promise<Record<string, unknown> | null> {
    return this.findAdresarByField('ic', ic)
  }

  async findAdresarByVatId(vatId: string): Promise<Record<string, unknown> | null> {
    return this.findAdresarByField('vatId', vatId)
  }

  async findAdresarByDic(dic: string): Promise<Record<string, unknown> | null> {
    return this.findAdresarByField('dic', dic)
  }

  /**
   * Try vatId, then ic, then dic for each candidate string (order preserved).
   */
  async findAdresarByTaxCandidates(candidates: string[]): Promise<Record<string, unknown> | null> {
    for (const raw of candidates) {
      const value = raw.trim()
      if (!value) continue
      const byVat = await this.findAdresarByVatId(value)
      if (byVat) return byVat
      const byIc = await this.findAdresarByIc(value)
      if (byIc) return byIc
      const byDic = await this.findAdresarByDic(value)
      if (byDic) return byDic
    }
    return null
  }

  async findAdresarByEmail(email: string): Promise<Record<string, unknown> | null> {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return null
    return this.findAdresarByField('email', trimmed)
  }

  private async findAdresarByField(
    field: 'ic' | 'vatId' | 'dic' | 'email',
    value: string,
  ): Promise<Record<string, unknown> | null> {
    const trimmed = value.trim()
    if (!trimmed) return null
    const filter = encodeURIComponent(`${field}='${this.escapeFlexiLiteral(trimmed)}'`)
    const path =
      `/adresar.json?limit=1&detail=custom:id,kod,nazev,ic,dic,vatId,email&filter=${filter}`
    try {
      const payload = await this.request<unknown>('GET', path)
      const rows = this.extractEvidence<Record<string, unknown>>(payload, 'adresar')
      return rows[0] ?? null
    } catch {
      return null
    }
  }

  async putAdresar(document: Record<string, unknown>): Promise<unknown> {
    return this.request('PUT', '/adresar.json', {
      winstrom: {
        '@version': '1.0',
        adresar: [document],
      },
    })
  }

  async putSkladovyPohyb(document: Record<string, unknown>): Promise<{
    nativeId: string | null
    ref: string | null
    raw: unknown
  }> {
    const payload = await this.request<unknown>('PUT', '/skladovy-pohyb.json', {
      winstrom: {
        '@version': '1.0',
        'skladovy-pohyb': [document],
      },
    })
    return this.parseWriteResult(payload)
  }

  async completePrevodka(documentId: string): Promise<unknown> {
    return this.request('PUT', '/skladovy-pohyb.json', {
      winstrom: {
        '@version': '1.0',
        'skladovy-pohyb': [
          {
            id: documentId,
            '@action': 'dokoncit-prevodku',
          },
        ],
      },
    })
  }

  /**
   * REL-003-PRE-A: direct `/objednavka-prijata/{extId}.json` returns 404 on live Flexi.
   * Use path-filter `/(id='ext:…')` (same class as WEBHOOK-002B multi-id). Never query `?filter=`.
   */
  async putFakturaPrijata(document: Record<string, unknown>): Promise<{
    nativeId: string | null
    ref: string | null
    raw: unknown
  }> {
    const payload = await this.request<unknown>('PUT', '/faktura-prijata.json', {
      winstrom: {
        '@version': '1.0',
        'faktura-prijata': [document],
      },
    })
    return this.parseWriteResult(payload)
  }

  /**
   * Attach binary PDF to received invoice (faktura-prijata).
   * @see https://podpora.flexibee.eu/en/articles/4783164-how-to-save-a-pdf-to-a-document-via-api
   */
  async putFakturaPrijataAttachment(
    nativeId: string,
    fileName: string,
    pdfBuffer: Buffer,
    settingsOverride?: FlexiSettings,
  ): Promise<void> {
    const settings = settingsOverride ?? (await this.settingsService.getSettings())
    if (!settings.baseUrl || !settings.companyId) {
      throw new Error('ABRA Flexi не налаштовано (baseUrl / companyId).')
    }

    const safeName = fileName.trim() || 'invoice.pdf'
    const encodedName = encodeURIComponent(safeName)
    const url = `${this.companyBase(settings)}/faktura-prijata/${encodeURIComponent(nativeId)}/prilohy/new/${encodedName}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FLEXI_HTTP_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: this.authHeader(settings),
          Accept: 'application/json',
          'Content-Type': 'application/pdf',
        },
        body: new Uint8Array(pdfBuffer),
        signal: controller.signal,
      })

      void this.settingsService.incrementApiCalls(1)

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Flexi attachment HTTP ${response.status}: ${text.slice(0, 500)}`)
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Search cenik by name. Flexi path-filter does NOT support leading-wildcard
   * `like '%…%'` (returns empty). Use `nazev begins '…'` and optional `nazev ends 'CUT'|'C2'`.
   */
  async searchCenikByNameFragment(
    fragment: string,
    limit = 20,
    sizeOrType?: string,
  ): Promise<FlexiCenikItem[]> {
    const trimmed = fragment.trim()
    if (!trimmed) return []

    const prefixes = buildFlexiBeginsPrefixes(trimmed)
    if (prefixes.length === 0) return []

    const size = sizeOrType?.trim()
    const seen = new Set<string>()
    const items: FlexiCenikItem[] = []

    for (const prefix of prefixes) {
      const escaped = this.escapeFlexiLiteral(prefix.replace(/'/g, "''"))
      let wql = `nazev begins '${escaped}'`
      if (size) {
        const sizeEsc = this.escapeFlexiLiteral(size.replace(/'/g, "''"))
        wql += ` and nazev ends '${sizeEsc}'`
      }
      const filter = encodeURIComponent(wql)
      const path = `/cenik/(${filter}).json?limit=${limit}&detail=${encodeURIComponent(CENIK_DETAIL)}`
      try {
        const payload = await this.request<unknown>('GET', path)
        const rows = this.extractEvidence<Record<string, unknown>>(payload, 'cenik')
        for (const row of rows) {
          const item = this.parseCenikRow(row)
          if (!item || seen.has(item.id)) continue
          seen.add(item.id)
          items.push(item)
        }
        if (items.length > 0) break
      } catch (error) {
        this.logger.warn(
          `searchCenikByNameFragment begins("${prefix}", size=${size ?? ''}) failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    return this.overlayWarehouseStock(items)
  }

  async isObjednavkaPrijataListEmpty(): Promise<boolean> {
    const path = `/objednavka-prijata.json?limit=1&detail=custom:id`
    const payload = await this.request<unknown>('GET', path)
    const rows = this.extractEvidence<Record<string, unknown>>(payload, 'objednavka-prijata')
    return rows.length === 0
  }

  async fetchObjednavkaByExtId(extId: string): Promise<Record<string, unknown> | null> {
    const trimmed = extId.trim()
    if (!trimmed) return null
    const filter = encodeURIComponent(`id='${this.escapeFlexiLiteral(trimmed)}'`)
    const path = `/objednavka-prijata/(${filter}).json?detail=full`
    try {
      const payload = await this.request<unknown>('GET', path)
      const rows = this.extractEvidence<Record<string, unknown>>(payload, 'objednavka-prijata')
      return rows[0] ?? null
    } catch (error) {
      this.logger.debug(
        `fetchObjednavkaByExtId(${extId}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return null
    }
  }

  async fetchChanges(startVersion: number): Promise<{
    changes: Array<{
      evidence?: string
      id?: string | number
      operation?: string
      globalVersion?: number
      inVersion?: number
    }>
    nextVersion: number
  }> {
    const path = `/changes.json?start=${startVersion}&limit=500`
    const payload = await this.request<Record<string, unknown>>('GET', path)
    const winstrom = (payload.winstrom ?? payload) as Record<string, unknown>
    const changes = this.asArray<Record<string, unknown>>(winstrom.change ?? winstrom.changes)
    const mapped = changes.map((c) => {
      const inRaw = c['@in-version'] ?? c.inVersion ?? c['in-version']
      const inNum = this.num(inRaw, 0)
      return {
        evidence: String(c.evidence ?? c['@evidence'] ?? ''),
        id: (c.id ?? c['@id']) as string | number | undefined,
        operation: String(c.operation ?? c['@operation'] ?? ''),
        globalVersion: this.num(c.globalVersion ?? c['@globalVersion'] ?? 0),
        inVersion: inNum > 0 ? inNum : undefined,
      }
    })
    const nextRaw = winstrom.next
    const nextVersion =
      nextRaw === 'none' || nextRaw === undefined || nextRaw === null
        ? mapped.reduce(
            (max, c) => Math.max(max, c.inVersion ?? c.globalVersion ?? 0),
            startVersion,
          )
        : this.num(nextRaw, startVersion)
    return { changes: mapped, nextVersion }
  }

  async fetchStromNodes(rootCode: string): Promise<FlexiStromNode[]> {
    const filter = encodeURIComponent(`strom='code:${rootCode}'`)
    const path = `/strom.json?limit=0&detail=full&filter=${filter}`
    const payload = await this.request<unknown>('GET', path)
    const rows = this.extractEvidence<Record<string, unknown>>(payload, 'strom')
    return rows.map((row) => {
      const id = String(row.id ?? '').trim()
      const kod = String(row.kod ?? row.code ?? id).trim()
      const otec = row.otec ?? row['otec@ref'] ?? row.parent
      let parentId: string | null = null
      let parentKod: string | null = null
      if (typeof otec === 'string') {
        if (otec.startsWith('code:')) parentKod = otec.slice(5)
        else if (/^\d+$/.test(otec)) parentId = otec
        else parentKod = otec
      } else if (otec && typeof otec === 'object') {
        const o = otec as Record<string, unknown>
        parentId = o.id != null ? String(o.id) : null
        parentKod = o.kod != null ? String(o.kod) : null
      }
      const localeFields = parseStromLocaleFields(row)
      return {
        id: id || kod,
        kod,
        nazev: String(row.nazev ?? row.name ?? kod).trim() || kod,
        parentId,
        parentKod,
        poradi: Math.trunc(this.num(row.poradi ?? row.order ?? 0)),
        localeNames: localeFields.localeNames,
        localeDescriptions: localeFields.localeDescriptions,
        localeTextAbove: localeFields.localeTextAbove,
        localeTextBelow: localeFields.localeTextBelow,
      }
    })
  }

  async fetchStromCenikLinks(): Promise<FlexiStromCenikLink[]> {
    const path = `/strom-cenik.json?limit=0&detail=full`
    const payload = await this.request<unknown>('GET', path)
    const rows = this.extractEvidence<Record<string, unknown>>(payload, 'strom-cenik')
    const links: FlexiStromCenikLink[] = []
    for (const row of rows) {
      const uzelRaw = row.uzel ?? row['uzel@ref']
      const uzelId =
        typeof uzelRaw === 'object' && uzelRaw
          ? String((uzelRaw as { id?: unknown }).id ?? '')
          : String(uzelRaw ?? '').replace(/^code:/, '')
      const idZaznamu = String(row.idZaznamu ?? row.cenik ?? row['idZaznamu@ref'] ?? '').trim()
      if (!uzelId || !idZaznamu) continue
      const cenikKod = idZaznamu.startsWith('code:') ? idZaznamu.slice(5) : idZaznamu
      const cenikId = /^\d+$/.test(idZaznamu) ? idZaznamu : cenikKod
      links.push({ cenikKod, cenikId, uzelId: String(uzelId).replace(/^code:/, '') })
    }
    return links
  }
}

/**
 * Prefixes for Flexi `nazev begins '…'` (leading-wildcard like is unsupported).
 * Prefer genus + species, then genus only.
 */
function buildFlexiBeginsPrefixes(fragment: string): string[] {
  const cleaned = fragment
    .replace(/['’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []
  const words = cleaned.split(' ').filter(Boolean)
  const out: string[] = []
  if (words.length >= 2) out.push(`${words[0]} ${words[1]}`)
  if (words.length >= 1) out.push(words[0])
  if (words.length >= 3) out.push(`${words[0]} ${words[1]} ${words[2]}`)
  return [...new Set(out.filter((p) => p.length >= 3))]
}
