import { Injectable, Logger } from '@nestjs/common'
import { SalesPriceScope } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import {
  classifyOdberatelScope,
  parseFlexiSalesDate,
  stripFlexiCode,
} from '../pricing/sales-price.helpers'
import { CommerceService } from '../commerce/commerce.service'
import { FlexiClient } from './flexi.client'
import { FLEXI_SETTINGS_KEY, SALES_PRICES_SYNC_META_KEY } from './flexi.constants'
import { FlexiSettingsService } from './flexi.settings.service'

const ODBERATEL_DETAIL =
  'custom:id,prodejCena,cenik,firma,skupCen,mena,platiOdData,platiDoData,limMnoz2,limMnoz3,limMnoz4,limMnoz5,prodejCena2,prodejCena3,prodejCena4,prodejCena5,lastUpdate'

const PAGE_SIZE = 50

export type FlexiSalesPricesSyncResult = {
  ok: boolean
  groupsUpserted: number
  upserted: number
  deleted: number
  skippedUnmatchedSku: number
  skippedInvalid: number
  fetched: number
  message: string
}

@Injectable()
export class FlexiSalesPricesSyncService {
  private readonly logger = new Logger(FlexiSalesPricesSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: FlexiClient,
    private readonly flexiSettings: FlexiSettingsService,
    private readonly commerce: CommerceService,
  ) {}

  async syncFull(): Promise<FlexiSalesPricesSyncResult> {
    const configured = await this.flexiSettings.isConfigured()
    if (!configured) {
      return this.fail('Flexi не налаштовано.')
    }

    await this.writeMeta({
      lastAttemptAt: new Date().toISOString(),
      lastStatus: 'running',
      lastMessage: 'Sales Prices sync started',
    })

    try {
      const groupsUpserted = await this.syncPriceGroups()
      const currencyDefault = (await this.commerce.getDefaultCurrencyCode()).toUpperCase()
      const skuToVariant = await this.loadSkuVariantMap()

      const seenIds = new Set<string>()
      let start = 0
      let fetched = 0
      let upserted = 0
      let skippedUnmatchedSku = 0
      let skippedInvalid = 0
      type PendingRow = {
        productVariantId: string
        flexiOdberatelId: string
        scope: SalesPriceScope
        priceGroupCode: string | null
        flexiFirmaKod: string | null
        currency: string
        unitPrice: number
        validFrom: Date | null
        validTo: Date | null
        limMnoz2: number
        unitPrice2: number | null
        limMnoz3: number
        unitPrice3: number | null
        limMnoz4: number
        unitPrice4: number | null
        limMnoz5: number
        unitPrice5: number | null
        flexiLastUpdate: Date | null
        syncedAt: Date
      }
      const pending: PendingRow[] = []

      for (;;) {
        const path = `/odberatele.json?limit=${PAGE_SIZE}&start=${start}&detail=${ODBERATEL_DETAIL}&filtrovat-platnost=false&add-row-count=true`
        const json = await this.client.request<Record<string, unknown>>(
          'GET',
          path,
          undefined,
          undefined,
          { usageCategory: 'catalog' },
        )
        const root = (json?.winstrom ?? json) as Record<string, unknown>
        const rows = this.asArray(root['odberatel'])
        if (!rows.length) break

        for (const row of rows) {
          fetched += 1
          const flexiId = String(row.id ?? '').trim()
          if (!flexiId) {
            skippedInvalid += 1
            continue
          }
          seenIds.add(flexiId)

          const sku = stripFlexiCode(row.cenik)
          if (!sku) {
            skippedInvalid += 1
            continue
          }
          const variantId = skuToVariant.get(sku)
          if (!variantId) {
            skippedUnmatchedSku += 1
            continue
          }

          const unitPrice = Number(row.prodejCena)
          if (!(unitPrice > 0)) {
            skippedInvalid += 1
            continue
          }

          const { scope, priceGroupCode, flexiFirmaKod } = classifyOdberatelScope(row)
          const mena = stripFlexiCode(row.mena).toUpperCase() || currencyDefault

          pending.push({
            productVariantId: variantId,
            flexiOdberatelId: flexiId,
            scope,
            priceGroupCode,
            flexiFirmaKod,
            currency: mena,
            unitPrice,
            validFrom: parseFlexiSalesDate(row.platiOdData),
            validTo: parseFlexiSalesDate(row.platiDoData),
            limMnoz2: Math.trunc(Number(row.limMnoz2) || 0),
            unitPrice2: this.optionalPrice(row.prodejCena2),
            limMnoz3: Math.trunc(Number(row.limMnoz3) || 0),
            unitPrice3: this.optionalPrice(row.prodejCena3),
            limMnoz4: Math.trunc(Number(row.limMnoz4) || 0),
            unitPrice4: this.optionalPrice(row.prodejCena4),
            limMnoz5: Math.trunc(Number(row.limMnoz5) || 0),
            unitPrice5: this.optionalPrice(row.prodejCena5),
            flexiLastUpdate: parseFlexiSalesDate(row.lastUpdate),
            syncedAt: new Date(),
          })
        }

        start += PAGE_SIZE
        if (rows.length < PAGE_SIZE) break
      }

      // Upsert only after full GET pull succeeds — mid-fail leaves prior DB rows intact.
      for (const data of pending) {
        await this.prisma.productSalesPrice.upsert({
          where: { flexiOdberatelId: data.flexiOdberatelId },
          create: data,
          update: {
            productVariantId: data.productVariantId,
            scope: data.scope,
            priceGroupCode: data.priceGroupCode,
            flexiFirmaKod: data.flexiFirmaKod,
            currency: data.currency,
            unitPrice: data.unitPrice,
            validFrom: data.validFrom,
            validTo: data.validTo,
            limMnoz2: data.limMnoz2,
            unitPrice2: data.unitPrice2,
            limMnoz3: data.limMnoz3,
            unitPrice3: data.unitPrice3,
            limMnoz4: data.limMnoz4,
            unitPrice4: data.unitPrice4,
            limMnoz5: data.limMnoz5,
            unitPrice5: data.unitPrice5,
            flexiLastUpdate: data.flexiLastUpdate,
            syncedAt: data.syncedAt,
          },
        })
        upserted += 1
      }

      // Safe delete: only after full successful pull + upserts.
      let deleted = 0
      if (seenIds.size > 0) {
        const stale = await this.prisma.productSalesPrice.findMany({
          where: { flexiOdberatelId: { notIn: [...seenIds] } },
          select: { id: true },
        })
        if (stale.length) {
          const del = await this.prisma.productSalesPrice.deleteMany({
            where: { id: { in: stale.map((r) => r.id) } },
          })
          deleted = del.count
        }
      }

      const result: FlexiSalesPricesSyncResult = {
        ok: true,
        groupsUpserted,
        upserted,
        deleted,
        skippedUnmatchedSku,
        skippedInvalid,
        fetched,
        message: `Sales Prices sync OK: groups=${groupsUpserted}, upserted=${upserted}, deleted=${deleted}, unmatchedSku=${skippedUnmatchedSku}`,
      }
      await this.writeMeta({
        lastSuccessAt: new Date().toISOString(),
        lastAttemptAt: new Date().toISOString(),
        lastStatus: 'success',
        lastMessage: result.message,
        lastCounts: {
          groupsUpserted,
          upserted,
          deleted,
          skippedUnmatchedSku,
          skippedInvalid,
          fetched,
        },
      })
      this.logger.log(result.message)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Sales Prices sync failed: ${message}`)
      await this.writeMeta({
        lastAttemptAt: new Date().toISOString(),
        lastStatus: 'error',
        lastMessage: message,
      })
      return this.fail(message)
    }
  }

  private async syncPriceGroups(): Promise<number> {
    const json = await this.client.request<Record<string, unknown>>(
      'GET',
      '/cenikova-skupina.json?limit=0&detail=custom:id,kod,nazev&add-row-count=true',
      undefined,
      undefined,
      { usageCategory: 'catalog' },
    )
    const root = (json?.winstrom ?? json) as Record<string, unknown>
    const total = Number(root['@rowCount'] ?? 0)
    const pageSize = 50
    let upserted = 0
    const seenCodes = new Set<string>()

    for (let start = 0; start < Math.max(total, pageSize); start += pageSize) {
      const page = await this.client.request<Record<string, unknown>>(
        'GET',
        `/cenikova-skupina.json?limit=${pageSize}&start=${start}&detail=custom:id,kod,nazev`,
        undefined,
        undefined,
        { usageCategory: 'catalog' },
      )
      const rows = this.asArray(((page?.winstrom ?? page) as Record<string, unknown>)['cenikova-skupina'])
      if (!rows.length) break
      const now = new Date()
      for (const row of rows) {
        const flexiId = String(row.id ?? '').trim()
        const code = stripFlexiCode(row.kod)
        if (!flexiId || !code) continue
        seenCodes.add(code)
        await this.prisma.flexiPriceGroup.upsert({
          where: { flexiId },
          create: {
            flexiId,
            code,
            name: String(row.nazev ?? code),
            lastSyncedAt: now,
          },
          update: {
            code,
            name: String(row.nazev ?? code),
            lastSyncedAt: now,
          },
        })
        upserted += 1
      }
      if (rows.length < pageSize) break
    }

    if (seenCodes.size) {
      await this.prisma.flexiPriceGroup.deleteMany({
        where: { code: { notIn: [...seenCodes] } },
      })
    }
    return upserted
  }

  private async loadSkuVariantMap(): Promise<Map<string, string>> {
    const rows = await this.prisma.productVariant.findMany({
      where: { sku: { not: null } },
      select: { id: true, sku: true },
    })
    const map = new Map<string, string>()
    for (const row of rows) {
      if (row.sku) map.set(row.sku, row.id)
    }
    return map
  }

  private optionalPrice(raw: unknown): number | null {
    const n = Number(raw)
    return n > 0 ? n : null
  }

  private asArray(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value as Record<string, unknown>[]
    if (value && typeof value === 'object') return [value as Record<string, unknown>]
    return []
  }

  private fail(message: string): FlexiSalesPricesSyncResult {
    return {
      ok: false,
      groupsUpserted: 0,
      upserted: 0,
      deleted: 0,
      skippedUnmatchedSku: 0,
      skippedInvalid: 0,
      fetched: 0,
      message,
    }
  }

  private async writeMeta(meta: Record<string, unknown>) {
    const row = await this.prisma.settings.findUnique({ where: { key: FLEXI_SETTINGS_KEY } })
    let current: Record<string, unknown> = {}
    if (row?.value) {
      try {
        current = JSON.parse(row.value) as Record<string, unknown>
      } catch {
        current = {}
      }
    }
    const prev = (current[SALES_PRICES_SYNC_META_KEY] ?? {}) as Record<string, unknown>
    current[SALES_PRICES_SYNC_META_KEY] = { ...prev, ...meta }
    await this.prisma.settings.upsert({
      where: { key: FLEXI_SETTINGS_KEY },
      create: { key: FLEXI_SETTINGS_KEY, value: JSON.stringify(current) },
      update: { value: JSON.stringify(current) },
    })
  }
}
