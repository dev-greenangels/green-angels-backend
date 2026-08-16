import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { VariantQuantityDiscountType } from '@prisma/client'

import { RETAIL_PRICE_TYPE } from '../commerce/commerce.constants'
import { CommerceService } from '../commerce/commerce.service'
import { PrismaService } from '../prisma/prisma.service'
import { ProductsService } from '../products/products.service'
import {
  classifyFlexiError,
  erpSyncErrorCodeForKind,
  FlexiExportRetryError,
} from '../orders/erp-sync.errors'
import { resolveErpSyncStatus } from '../orders/erp-sync.constants'
import { FLEXI_ORDER_CONFLICT_USER_STATUS, FLEXI_STOCK_FILTER_CHUNK } from './flexi.constants'
import { applyFlexiOrderHeaderMapping } from './flexi-order-export-mapping'
import {
  categoryTranslationCreates,
  mapStromCategoryContent,
  mapStromProductContent,
  productTranslationCreates,
} from './flexi-strom-content-mapping'
import { FlexiChangeIntakeService, type FlexiIntakeCollapseGroup } from './flexi.change-intake.service'
import { FlexiClient } from './flexi.client'
import { FlexiSettingsService } from './flexi.settings.service'
import type {
  FlexiCenikItem,
  FlexiChangeEntry,
  FlexiDocumentSendMode,
  FlexiExportOrderResult,
  FlexiImportResult,
  FlexiStockCheckResult,
  FlexiStockLine,
  FlexiStromCenikLink,
  FlexiStromNode,
  FlexiStromSyncResult,
  FlexiSyncResult,
} from './flexi.types'

function slugify(input: string): string {
  return (
    input
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  )
}

/** Last segment of SKU: PENN-ALO-LADYU-C2 → C2; …-P9 → P9 */
function parseSizeLabel(kod: string, nazev: string): string | null {
  const fromKod = kod.match(/(?:^|[-_\s])((?:P|C|p|c)?\d+(?:\.\d+)?(?:L|l)?)$/)
  if (fromKod?.[1]) return fromKod[1].toUpperCase()
  const fromName = nazev.match(/\b((?:P|C)\d+(?:\.\d+)?(?:L)?)\b/i)
  if (fromName?.[1]) return fromName[1].toUpperCase()
  return null
}

/** Flexi product external id on site: flexi:{stromLeafId}. Never bare digits (collides with 1C). */
const FLEXI_PRODUCT_LEGACY_PREFIX = 'flexi:'

function toFlexiProductLegacyId(leafId: string): string {
  return `${FLEXI_PRODUCT_LEGACY_PREFIX}${leafId.trim()}`
}

/** Match Flexi-owned products only (incl. older prefixes from prior syncs). */
function productLegacyCandidates(leafId: string): string[] {
  const id = leafId.trim()
  return [...new Set([toFlexiProductLegacyId(id), `flexi-strom:${id}`, `strom:${id}`])]
}

/** Flexi utility folders that are not shop categories */
function isSkippedStromNode(node: { kod: string; nazev: string }): boolean {
  const name = node.nazev.trim().toLowerCase()
  const kod = node.kod.trim().toLowerCase()
  const junk = [
    'added items',
    'pridane',
    'pridané',
    'přidané',
    'přidané položky',
    'pridane polozky',
    'tree in price list',
    'strom ceniku',
    'strom ceníku',
    'strom cennika',
  ]
  if (junk.some((j) => name === j || name.includes(j))) return true
  if (['add', 'added', 'tree', 'strom'].includes(kod)) return true
  return false
}

/**
 * Upsert translations for locales present in the maps (do not wipe others).
 */
async function upsertProductLocaleContent(
  prisma: PrismaService,
  productId: string,
  mapped: ReturnType<typeof mapStromProductContent>,
): Promise<void> {
  const locales = new Set([...Object.keys(mapped.names), ...Object.keys(mapped.descriptions)])
  for (const locale of locales) {
    const name = mapped.names[locale as keyof typeof mapped.names]?.trim()
    const description = mapped.descriptions[locale as keyof typeof mapped.descriptions]
    await prisma.productTranslation.upsert({
      where: { productId_locale: { productId, locale } },
      create: {
        productId,
        locale,
        name: name || mapped.latinName,
        description: description ?? null,
      },
      update: {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    })
  }
}

async function upsertCategoryLocaleContent(
  prisma: PrismaService,
  categoryId: string,
  mapped: ReturnType<typeof mapStromCategoryContent>,
): Promise<void> {
  const locales = new Set([
    ...Object.keys(mapped.names),
    ...Object.keys(mapped.descriptions),
    ...Object.keys(mapped.footers),
  ])
  for (const locale of locales) {
    const name = mapped.names[locale as keyof typeof mapped.names]?.trim()
    const description = mapped.descriptions[locale as keyof typeof mapped.descriptions]
    const footerDescription = mapped.footers[locale as keyof typeof mapped.footers]
    await prisma.categoryTranslation.upsert({
      where: { categoryId_locale: { categoryId, locale } },
      create: {
        categoryId,
        locale,
        name: name || mapped.latinName,
        description: description ?? null,
        footerDescription: footerDescription ?? null,
      },
      update: {
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(footerDescription !== undefined ? { footerDescription } : {}),
      },
    })
  }
}

/** Parents before children so nested categories keep Catalog → … tree */
function orderBranchesTopologically(
  branches: FlexiStromNode[],
  byKod: Map<string, FlexiStromNode>,
): FlexiStromNode[] {
  const branchIds = new Set(branches.map((b) => b.id))
  const remaining = new Map(branches.map((b) => [b.id, b]))
  const ordered: FlexiStromNode[] = []

  const parentIdOf = (node: FlexiStromNode) =>
    node.parentId ?? (node.parentKod ? byKod.get(node.parentKod)?.id : null) ?? null

  while (remaining.size > 0) {
    let progressed = false
    for (const [id, node] of [...remaining]) {
      const parentId = parentIdOf(node)
      const parentIsImportedBranch = Boolean(parentId && branchIds.has(parentId))
      if (!parentIsImportedBranch || ordered.some((o) => o.id === parentId)) {
        ordered.push(node)
        remaining.delete(id)
        progressed = true
      }
    }
    if (!progressed) {
      ordered.push(...[...remaining.values()].sort((a, b) => a.poradi - b.poradi))
      break
    }
  }
  return ordered
}

@Injectable()
export class FlexiService {
  private readonly logger = new Logger(FlexiService.name)

  constructor(
    private readonly settings: FlexiSettingsService,
    private readonly client: FlexiClient,
    private readonly prisma: PrismaService,
    private readonly commerce: CommerceService,
    private readonly products: ProductsService,
    private readonly intake: FlexiChangeIntakeService,
  ) {}

  async isConfigured(): Promise<boolean> {
    return this.settings.isConfigured()
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const configured = await this.isConfigured()
    if (!configured) {
      return {
        ok: false,
        message: 'ABRA Flexi не налаштовано — увімкніть інтеграцію та вкажіть URL, компанію й логін.',
      }
    }
    return this.client.testConnection()
  }

  resolveDocumentSendMode(isB2b: boolean, mode: { b2b: FlexiDocumentSendMode; b2c: FlexiDocumentSendMode }) {
    return isB2b ? mode.b2b : mode.b2c
  }

  shouldSendSiteDocument(mode: FlexiDocumentSendMode): boolean {
    return mode === 'site' || mode === 'both'
  }

  shouldSendAbraDocument(mode: FlexiDocumentSendMode): boolean {
    return mode === 'abra' || mode === 'both'
  }

  async checkStock(lines: FlexiStockLine[]): Promise<FlexiStockCheckResult> {
    const configured = await this.isConfigured()
    if (!configured) {
      throw new ServiceUnavailableException(
        'Склад ABRA Flexi недоступний. Спробуйте пізніше або зверніться до менеджера.',
      )
    }

    const withSku = lines.filter((l) => l.sku.trim())
    if (withSku.length === 0) {
      return { ok: true, unavailable: [], message: 'Немає SKU для перевірки.' }
    }

    try {
      const stockMap = await this.client.fetchStockBySkusForCheckout(withSku.map((l) => l.sku))
      const unavailable: FlexiStockCheckResult['unavailable'] = []
      for (const line of withSku) {
        const available = stockMap.get(line.sku.trim()) ?? 0
        if (available < line.quantity) {
          unavailable.push({
            sku: line.sku.trim(),
            requested: line.quantity,
            available,
          })
        }
      }
      if (unavailable.length > 0) {
        return {
          ok: false,
          unavailable,
          message: `Недостатньо товару на складі: ${unavailable
            .map((u) => `${u.sku} (потрібно ${u.requested}, є ${u.available})`)
            .join('; ')}.`,
        }
      }
      return { ok: true, unavailable: [], message: 'OK' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`Flexi checkStock failed: ${message}`)
      throw new ServiceUnavailableException(
        'Не вдалося перевірити залишки в ABRA Flexi. Спробуйте пізніше.',
      )
    }
  }

  async applyCenikItem(item: FlexiCenikItem): Promise<'updated' | 'unmatched'> {
    const sku = item.kod.trim()
    const variant = await this.prisma.productVariant.findUnique({
      where: { sku },
      select: {
        id: true,
        productId: true,
        prices: {
          where: { priceType: RETAIL_PRICE_TYPE },
          select: { id: true, value: true, currency: true },
        },
      },
    })
    if (!variant) return 'unmatched'

    const currency = await this.commerce.getDefaultCurrencyCode()
    const retail = variant.prices.find((p) => p.currency === currency) ?? variant.prices[0]
    const nextPrice = Math.round(item.price * 100) / 100

    await this.prisma.$transaction(async (tx) => {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: {
          stock: item.stock,
          ...(item.weight != null && item.weight > 0 ? { weight: item.weight } : {}),
        },
      })

      if (item.cnCode) {
        await tx.product.update({
          where: { id: variant.productId },
          data: { cnCode: item.cnCode },
        })
      }

      if (retail) {
        const prev = Number(retail.value)
        // Never wipe a real price with Flexi 0 / missing cenik price.
        if (nextPrice > 0 && prev !== nextPrice) {
          await tx.productPrice.update({
            where: { id: retail.id },
            data: { value: nextPrice },
          })
          await tx.priceHistory.create({
            data: {
              productVariantId: variant.id,
              value: nextPrice,
              priceType: RETAIL_PRICE_TYPE,
              currency: retail.currency,
            },
          })
        }
      } else if (nextPrice > 0) {
        await tx.productPrice.create({
          data: {
            productVariantId: variant.id,
            priceType: RETAIL_PRICE_TYPE,
            currency,
            value: nextPrice,
          },
        })
        await tx.priceHistory.create({
          data: {
            productVariantId: variant.id,
            value: nextPrice,
            currency,
            priceType: RETAIL_PRICE_TYPE,
          },
        })
      }

      if (item.quantityPrices.length > 0) {
        await tx.productVariantQuantityPrice.deleteMany({
          where: { productVariantId: variant.id },
        })
        await tx.productVariantQuantityPrice.createMany({
          data: item.quantityPrices.map((qp, index) => ({
            productVariantId: variant.id,
            minQuantity: qp.minQuantity,
            discountType: VariantQuantityDiscountType.PERCENT,
            value: qp.percent,
            sortOrder: index,
          })),
        })
      }

      await this.products.touchProductAvailability(variant.productId, tx)
    })

    return 'updated'
  }

  /** Backup / manual: pull Changes API from stored cursor → durable intake → process. */
  async pollChanges(): Promise<FlexiSyncResult> {
    const configured = await this.isConfigured()
    if (!configured) {
      return { ok: false, itemsSynced: 0, unmatched: 0, message: 'ABRA Flexi не налаштовано.' }
    }

    try {
      const settings = await this.settings.getSettings()
      const { changes, nextVersion } = await this.client.fetchChanges(settings.globalVersion)
      await this.intake.ingestChanges(changes)
      const processed = await this.processDurableIntake({ flexiNextHint: nextVersion })
      const message = `Changes: ${changes.length} записів, groups=${processed.groups}, fetched=${processed.fetched}, pollStart→${processed.pollStart}, lastSafe=${processed.lastSafeCursor}.`
      await this.settings.updateSettings({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: processed.failed > 0 ? 'error' : 'ok',
        lastSyncMessage: message,
      })
      if (processed.failed > 0) {
        return {
          ok: false,
          itemsSynced: processed.fetched,
          unmatched: processed.failed,
          message,
        }
      }
      return { ok: true, itemsSynced: processed.fetched, unmatched: 0, message }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.settings.updateSettings({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'error',
        lastSyncMessage: message,
      })
      return { ok: false, itemsSynced: 0, unmatched: 0, message }
    }
  }

  /** Rare full pass over cenik (existing SKUs only). */
  async syncCenikFull(): Promise<FlexiSyncResult> {
    const configured = await this.isConfigured()
    if (!configured) {
      return { ok: false, itemsSynced: 0, unmatched: 0, message: 'ABRA Flexi не налаштовано.' }
    }

    let start = 0
    const limit = 100
    let itemsSynced = 0
    let unmatched = 0

    try {
      for (;;) {
        const page = await this.client.fetchCenikPage(start, limit)
        if (page.length === 0) break
        for (const item of page) {
          const result = await this.applyCenikItem(item)
          if (result === 'updated') itemsSynced += 1
          else unmatched += 1
        }
        if (page.length < limit) break
        start += limit
      }

      const message = `Повний sync: оновлено ${itemsSynced}, без SKU на сайті: ${unmatched}.`
      await this.settings.updateSettings({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'ok',
        lastSyncMessage: message,
      })
      return { ok: true, itemsSynced, unmatched, message }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.settings.updateSettings({
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'error',
        lastSyncMessage: message,
      })
      return { ok: false, itemsSynced, unmatched, message }
    }
  }

  /**
   * Legacy entry: persist durable evidence then process collapsed groups.
   * Does NOT advance cursor from nextVersion when any GET fails.
   */
  async applyChanges(changes: FlexiChangeEntry[], nextVersion?: number): Promise<void> {
    await this.intake.ingestChanges(changes)
    const result = await this.processDurableIntake({ flexiNextHint: nextVersion })
    if (result.failed > 0) {
      throw new Error(`Flexi intake: ${result.failed} group(s) failed`)
    }
  }

  /**
   * ERP-WEBHOOK-002A/B worker: collapse by object, batch-fetch cenik where verified,
   * apply latest state; safe cursor never skips FAILED.
   */
  async processDurableIntake(opts?: {
    flexiNextHint?: number
  }): Promise<{
    ok: boolean
    groups: number
    fetched: number
    failed: number
    lastSafeCursor: number
    pollStart: number
    httpFetches?: number
  }> {
    const groups = await this.intake.loadCollapseGroups()
    let fetched = 0
    let failed = 0
    let httpFetches = 0

    const cenikBound: Array<{ group: FlexiIntakeCollapseGroup; cenikId: string }> = []
    const otherGroups: FlexiIntakeCollapseGroup[] = []

    for (const group of groups) {
      const evidence = group.evidence
      if (evidence.includes('strom') && !evidence.includes('strom-cenik')) {
        otherGroups.push(group)
        continue
      }
      if (evidence.includes('objednavka-prijata')) {
        otherGroups.push(group)
        continue
      }
      if (evidence.includes('skladova-karta')) {
        try {
          await this.intake.markProcessing(group)
          httpFetches += 1
          const cenikId = await this.client.resolveCenikIdFromSkladovaKarta(group.objectId)
          if (!cenikId) {
            throw new Error(`skladova-karta ${group.objectId}: cannot resolve cenik id`)
          }
          cenikBound.push({ group, cenikId })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await this.intake.markGroupFailed(group, message)
          failed += 1
          this.logger.warn(
            `processDurableIntake ${group.evidence}/${group.objectId}@${group.changeVersion}: ${message}`,
          )
        }
        continue
      }
      if (evidence.includes('cenik') && !evidence.includes('strom-cenik')) {
        cenikBound.push({ group, cenikId: group.objectId })
        continue
      }
      otherGroups.push(group)
    }

    // Batch GET unique cenik ids (LIVE-VERIFIED path-filter). One HTTP per chunk of 40, not per event.
    const uniqueCenikIds = [...new Set(cenikBound.map((b) => b.cenikId))]
    let cenikMap = new Map<string, FlexiCenikItem>()
    const perIdFallbackErrors = new Map<string, string>()
    if (uniqueCenikIds.length > 0) {
      try {
        httpFetches += Math.max(1, Math.ceil(uniqueCenikIds.length / FLEXI_STOCK_FILTER_CHUNK))
        cenikMap = await this.client.fetchCenikByIds(uniqueCenikIds)
      } catch (error) {
        const batchError = error instanceof Error ? error.message : String(error)
        this.logger.warn(`fetchCenikByIds batch failed, falling back per-id: ${batchError}`)
        for (const cenikId of uniqueCenikIds) {
          try {
            httpFetches += 1
            const item = await this.client.fetchCenikById(cenikId)
            if (item) cenikMap.set(item.id, item)
          } catch (inner) {
            perIdFallbackErrors.set(
              cenikId,
              inner instanceof Error ? inner.message : String(inner),
            )
          }
        }
      }
    }

    const skladAlreadyProcessing = new Set(
      cenikBound.filter((b) => b.group.evidence.includes('skladova-karta')).map((b) => b.group.primaryId),
    )

    for (const { group, cenikId } of cenikBound) {
      if (!skladAlreadyProcessing.has(group.primaryId)) {
        await this.intake.markProcessing(group)
      }
      try {
        const fallbackErr = perIdFallbackErrors.get(cenikId)
        if (fallbackErr) {
          throw new Error(fallbackErr)
        }
        const item = cenikMap.get(cenikId)
        if (item) await this.applyCenikItem(item)
        await this.intake.markGroupSuccess(group)
        fetched += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await this.intake.markGroupFailed(group, message)
        failed += 1
        this.logger.warn(
          `processDurableIntake ${group.evidence}/${group.objectId}@${group.changeVersion}: ${message}`,
        )
      }
    }

    for (const group of otherGroups) {
      await this.intake.markProcessing(group)
      try {
        await this.applyCollapseGroup(group)
        await this.intake.markGroupSuccess(group)
        fetched += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await this.intake.markGroupFailed(group, message)
        failed += 1
        this.logger.warn(
          `processDurableIntake ${group.evidence}/${group.objectId}@${group.changeVersion}: ${message}`,
        )
      }
    }

    const cursor = await this.intake.recomputeAndPersistLastSafeCursor(opts?.flexiNextHint)
    return {
      ok: failed === 0,
      groups: groups.length,
      fetched,
      failed,
      lastSafeCursor: cursor.lastSafeCursor,
      pollStart: cursor.pollStart,
      httpFetches,
    }
  }

  private async applyCollapseGroup(group: FlexiIntakeCollapseGroup): Promise<void> {
    const evidence = group.evidence
    const id = group.objectId

    if (evidence.includes('strom') && !evidence.includes('strom-cenik')) {
      const settings = await this.settings.getSettings()
      if (!settings.syncCategoriesFromStrom) return
      const result = await this.syncStromCatalog()
      if (!result.ok) {
        throw new Error(result.message || 'Strom sync failed')
      }
      return
    }

    if (evidence.includes('cenik') && !evidence.includes('strom-cenik')) {
      const item = await this.client.fetchCenikById(id)
      if (item) await this.applyCenikItem(item)
      return
    }

    if (evidence.includes('skladova-karta')) {
      const cenikId = await this.client.resolveCenikIdFromSkladovaKarta(id)
      if (!cenikId) {
        throw new Error(`skladova-karta ${id}: cannot resolve cenik id`)
      }
      const item = await this.client.fetchCenikById(cenikId)
      if (item) await this.applyCenikItem(item)
      return
    }

    if (evidence.includes('objednavka-prijata')) {
      await this.syncOrderFromFlexi(id)
      return
    }

    // Unknown evidence: do not block cursor forever
    this.logger.debug(`Skipping unsupported Flexi evidence: ${evidence}`)
  }

  /**
   * Branch nodes → Category; leaf nodes → Product; strom-cenik → variants by SKU.
   */
  async syncStromCatalog(): Promise<FlexiStromSyncResult> {
    const configured = await this.isConfigured()
    if (!configured) {
      return {
        ok: false,
        categoriesUpserted: 0,
        productsUpserted: 0,
        variantsUpserted: 0,
        orphansCreated: 0,
        message: 'ABRA Flexi не налаштовано.',
        errors: [],
      }
    }

    const settings = await this.settings.getSettings()
    const errors: string[] = []
    let categoriesUpserted = 0
    let productsUpserted = 0
    let variantsUpserted = 0
    let orphansCreated = 0

    try {
      const nodes = await this.client.fetchStromNodes(settings.stromRootCode)
      const links = await this.client.fetchStromCenikLinks()
      const currency = await this.commerce.getDefaultCurrencyCode()

      const childrenOf = new Map<string, string[]>()
      const byId = new Map<string, FlexiStromNode>()
      const byKod = new Map<string, FlexiStromNode>()
      for (const n of nodes) {
        byId.set(n.id, n)
        if (n.kod) byKod.set(n.kod, n)
      }
      for (const n of nodes) {
        const parentKey = n.parentId ?? (n.parentKod ? byKod.get(n.parentKod)?.id : null)
        if (!parentKey) continue
        const list = childrenOf.get(parentKey) ?? []
        list.push(n.id)
        childrenOf.set(parentKey, list)
      }

      const isLeaf = (id: string) => !(childrenOf.get(id)?.length)

      // Resolve parent category UUID map: flexi node id → Category.id
      const categoryIdByFlexiNode = new Map<string, string>()

      const branchNodes = nodes.filter((n) => !isLeaf(n.id) && !isSkippedStromNode(n))
      const orderedBranches = orderBranchesTopologically(branchNodes, byKod)

      const resolveShopParentCategoryId = (parentFlexiId: string | null): string | null => {
        let current = parentFlexiId
        const seen = new Set<string>()
        while (current && !seen.has(current)) {
          seen.add(current)
          const mapped = categoryIdByFlexiNode.get(current)
          if (mapped) return mapped
          const parentNode = byId.get(current)
          if (!parentNode) break
          // Walk past skipped utility folders to nearest imported ancestor (e.g. Catalog)
          current =
            parentNode.parentId ??
            (parentNode.parentKod ? byKod.get(parentNode.parentKod)?.id : null) ??
            null
        }
        return null
      }

      for (const node of orderedBranches) {
        try {
          const parentFlexiId =
            node.parentId ?? (node.parentKod ? byKod.get(node.parentKod)?.id : null) ?? null
          const parentCategoryId = resolveShopParentCategoryId(parentFlexiId)

          const content = mapStromCategoryContent(node)
          const slug = slugify(node.kod || node.nazev || node.id).slice(0, 100)
          let existing = await this.prisma.category.findUnique({ where: { slug } })

          if (!existing) {
            existing = await this.prisma.category.create({
              data: {
                slug,
                latinName: content.latinName,
                position: node.poradi,
                parentId: parentCategoryId,
                isCatalogRoot: !parentCategoryId,
                isActive: true,
                translations: {
                  create: categoryTranslationCreates(content),
                },
              },
            })
          } else {
            await this.prisma.category.update({
              where: { id: existing.id },
              data: {
                latinName: content.latinName,
                position: node.poradi,
                parentId: parentCategoryId,
                isCatalogRoot: !parentCategoryId,
              },
            })
            await upsertCategoryLocaleContent(this.prisma, existing.id, content)
          }
          categoryIdByFlexiNode.set(node.id, existing.id)
          if (node.kod) categoryIdByFlexiNode.set(node.kod, existing.id)
          categoriesUpserted += 1
        } catch (error) {
          errors.push(
            `category ${node.kod}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      const linksByUzel = new Map<string, FlexiStromCenikLink[]>()
      for (const link of links) {
        const list = linksByUzel.get(link.uzelId) ?? []
        list.push(link)
        linksByUzel.set(link.uzelId, list)
        const node = byKod.get(link.uzelId)
        if (node) {
          const byNode = linksByUzel.get(node.id) ?? []
          if (!byNode.includes(link)) {
            byNode.push(link)
            linksByUzel.set(node.id, byNode)
          }
        }
      }

      const sizeAttributeId = await this.resolveSizeAttributeId(settings.sizeAttributeId)
      const leafNodes = nodes.filter((n) => isLeaf(n.id) && !isSkippedStromNode(n))
      const linkedCenikKods = new Set<string>()

      type LeafWork = {
        leaf: FlexiStromNode
        uniqueLinks: FlexiStromCenikLink[]
        categoryId: string
      }
      const leafWork: LeafWork[] = []

      for (const leaf of leafNodes) {
        const leafLinks = [
          ...(linksByUzel.get(leaf.id) ?? []),
          ...(leaf.kod ? linksByUzel.get(leaf.kod) ?? [] : []),
        ]
        const uniqueLinks = [...new Map(leafLinks.map((l) => [l.cenikKod, l])).values()]
        if (uniqueLinks.length === 0) continue

        const parentFlexiId =
          leaf.parentId ?? (leaf.parentKod ? byKod.get(leaf.parentKod)?.id : null) ?? null
        const categoryId =
          resolveShopParentCategoryId(parentFlexiId) || settings.defaultCategoryId || null
        if (!categoryId) {
          errors.push(`leaf ${leaf.kod || leaf.nazev}: немає parent Category і defaultCategoryId`)
          continue
        }
        leafWork.push({ leaf, uniqueLinks, categoryId })
        for (const link of uniqueLinks) linkedCenikKods.add(link.cenikKod)
      }

      // One batched cenik pull for all SKUs (sumDostupMj + cenaZakl/inc VAT + nomen + hmotMj)
      const allSkus = [...linkedCenikKods]
      const cenikBySku =
        allSkus.length > 0
          ? await this.client.fetchStockAndCenikBySkus(allSkus)
          : new Map<string, FlexiCenikItem>()

      for (const { leaf, uniqueLinks, categoryId } of leafWork) {
        try {
          const productLegacyId = toFlexiProductLegacyId(leaf.id)
          const slugBase = slugify(leaf.nazev || leaf.kod || leaf.id)
          let slug = slugBase.slice(0, 120)

          // CN from first linked cenik that has nomenclature
          let cnCode: string | null = null
          for (const link of uniqueLinks) {
            const item = cenikBySku.get(link.cenikKod)
            if (item?.cnCode) {
              cnCode = item.cnCode
              break
            }
          }

          const content = mapStromProductContent(leaf)

          let product =
            (await this.prisma.product.findFirst({
              where: { legacyId: { in: productLegacyCandidates(leaf.id) } },
              include: { variants: { select: { id: true, sku: true } } },
            })) ?? null

          if (!product) {
            const slugTaken = await this.prisma.product.findUnique({ where: { slug } })
            if (slugTaken) slug = `${slug}-${slugify(leaf.kod || leaf.id)}`.slice(0, 120)

            product = await this.prisma.product.create({
              data: {
                slug,
                legacyId: productLegacyId,
                categoryId,
                isPublished: false,
                latinName: content.latinName,
                ...(cnCode ? { cnCode } : {}),
                translations: {
                  create: productTranslationCreates(content),
                },
              },
              include: { variants: { select: { id: true, sku: true } } },
            })
          } else {
            await this.prisma.product.update({
              where: { id: product.id },
              data: {
                categoryId,
                latinName: content.latinName,
                legacyId: productLegacyId,
                ...(cnCode ? { cnCode } : {}),
              },
            })
            await upsertProductLocaleContent(this.prisma, product.id, content)
          }
          productsUpserted += 1

          for (const link of uniqueLinks) {
            const item =
              cenikBySku.get(link.cenikKod) ??
              (await this.client.fetchCenikById(link.cenikId).catch(() => null))
            if (!item) {
              errors.push(`cenik ${link.cenikKod}: не знайдено в Flexi`)
              continue
            }

            // Prefer CN from any variant if product still has none
            if (item.cnCode && !cnCode) {
              cnCode = item.cnCode
              await this.prisma.product.update({
                where: { id: product.id },
                data: { cnCode },
              })
            }

            const sizeLabel = parseSizeLabel(item.kod, item.nazev)
            let attributeValueIds: string[] = []
            if (sizeAttributeId && sizeLabel) {
              const valueId = await this.ensureSizeAttributeValue(sizeAttributeId, sizeLabel)
              if (valueId) attributeValueIds = [valueId]
            }

            const existingVariant = await this.prisma.productVariant.findUnique({
              where: { sku: item.kod },
              select: { id: true, productId: true },
            })

            if (existingVariant && existingVariant.productId !== product.id) {
              errors.push(
                `sku ${item.kod}: уже на іншому Product ${existingVariant.productId}`,
              )
              continue
            }

            if (!existingVariant) {
              const createPrice = item.price > 0
              const createdVariant = await this.prisma.productVariant.create({
                data: {
                  productId: product.id,
                  sku: item.kod,
                  stock: item.stock,
                  ...(item.weight != null && item.weight > 0 ? { weight: item.weight } : {}),
                  ...(createPrice
                    ? {
                        prices: {
                          create: {
                            priceType: RETAIL_PRICE_TYPE,
                            currency,
                            value: Math.round(item.price * 100) / 100,
                          },
                        },
                      }
                    : {}),
                  ...(attributeValueIds.length > 0
                    ? {
                        attributeValues: {
                          create: attributeValueIds.map((valueId) => ({ valueId })),
                        },
                      }
                    : {}),
                },
                select: { id: true },
              })
              if (createPrice) {
                await this.prisma.priceHistory.create({
                  data: {
                    productVariantId: createdVariant.id,
                    value: Math.round(item.price * 100) / 100,
                    priceType: RETAIL_PRICE_TYPE,
                    currency,
                  },
                })
              }
            }

            await this.applyCenikItem(item)

            if (attributeValueIds.length > 0) {
              const variant = await this.prisma.productVariant.findUnique({
                where: { sku: item.kod },
                select: { id: true },
              })
              if (variant) {
                await this.prisma.productVariantAttributeValue.deleteMany({
                  where: { variantId: variant.id },
                })
                await this.prisma.productVariantAttributeValue.createMany({
                  data: attributeValueIds.map((valueId) => ({
                    variantId: variant.id,
                    valueId,
                  })),
                  skipDuplicates: true,
                })
              }
            }

            await this.products.touchProductAvailability(product.id)
            variantsUpserted += 1
          }
        } catch (error) {
          errors.push(
            `leaf ${leaf.kod || leaf.nazev}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        }
      }

      // Orphans: cenik with stock not under any leaf
      if (settings.defaultCategoryId) {
        let start = 0
        const limit = 100
        for (;;) {
          const page = await this.client.fetchCenikPage(start, limit)
          if (page.length === 0) break
          for (const item of page) {
            if (linkedCenikKods.has(item.kod) || item.stock <= 0) continue
            const exists = await this.prisma.productVariant.findUnique({
              where: { sku: item.kod },
              select: { id: true },
            })
            if (exists) continue
            try {
              const slug = slugify(item.kod).slice(0, 120)
              await this.products.create({
                name: item.nazev.slice(0, 200),
                slug,
                primaryCategoryId: settings.defaultCategoryId,
                isPublished: false,
                locale: 'uk',
                pricingMode: 'simple',
                variant: {
                  stock: item.stock,
                  price: Math.max(0, item.price),
                  attributeValueIds: [],
                  sku: item.kod,
                },
              })
              orphansCreated += 1
            } catch (error) {
              errors.push(
                `orphan ${item.kod}: ${error instanceof Error ? error.message : String(error)}`,
              )
            }
          }
          if (page.length < limit) break
          start += limit
        }
      }

      void currency

      const message = `Strom: категорій ${categoriesUpserted}, товарів ${productsUpserted}, варіантів ${variantsUpserted}, orphan ${orphansCreated}, помилок ${errors.length}.`
      await this.settings.updateSettings({
        lastStromSyncAt: new Date().toISOString(),
        lastStromSyncMessage: message,
        lastImportAt: new Date().toISOString(),
        lastImportMessage: message,
      })
      return {
        ok: errors.length === 0,
        categoriesUpserted,
        productsUpserted,
        variantsUpserted,
        orphansCreated,
        message,
        errors,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.settings.updateSettings({
        lastStromSyncAt: new Date().toISOString(),
        lastStromSyncMessage: message,
      })
      return {
        ok: false,
        categoriesUpserted,
        productsUpserted,
        variantsUpserted,
        orphansCreated,
        message,
        errors: [...errors, message],
      }
    }
  }

  private async resolveSizeAttributeId(configuredId: string): Promise<string | null> {
    if (configuredId.trim()) {
      const byId = await this.prisma.variantAttribute.findUnique({
        where: { id: configuredId.trim() },
        select: { id: true },
      })
      if (byId) return byId.id
    }

    // Prefer existing CONTAINER attribute, then slug/name heuristics
    const container = await this.prisma.variantAttribute.findFirst({
      where: { valueType: 'CONTAINER' },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    })
    if (container) return container.id

    const bySlug = await this.prisma.variantAttribute.findFirst({
      where: {
        OR: [
          { slug: { contains: 'size', mode: 'insensitive' } },
          { slug: { contains: 'container', mode: 'insensitive' } },
          { slug: { contains: 'rozmer', mode: 'insensitive' } },
          { slug: { contains: 'velikost', mode: 'insensitive' } },
          { slug: { contains: 'kontajner', mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    })
    if (bySlug) return bySlug.id

    return null
  }

  private async ensureSizeAttributeValue(
    attributeId: string,
    label: string,
  ): Promise<string | null> {
    const attribute = await this.prisma.variantAttribute.findUnique({
      where: { id: attributeId },
      include: {
        values: { include: { translations: true } },
      },
    })
    if (!attribute) return null
    const slug = slugify(label)
    const existing = attribute.values.find(
      (v) =>
        v.slug === slug ||
        v.translations.some((t) => t.label.toLowerCase() === label.toLowerCase()),
    )
    if (existing) return existing.id
    const created = await this.prisma.variantAttributeValue.create({
      data: {
        attributeId,
        slug,
        sortOrder: attribute.values.length,
        translations: {
          create: [
            { locale: 'uk', label },
            { locale: 'en', label },
            { locale: 'sk', label },
          ],
        },
      },
    })
    return created.id
  }

  private async resolveStatusCode(externalOrCode: string): Promise<string | null> {
    const value = externalOrCode.trim()
    if (!value) return null
    const byExternal = await this.prisma.orderStatusDefinition.findFirst({
      where: { externalCode: value, isActive: true },
      select: { code: true },
    })
    if (byExternal) return byExternal.code
    const byCode = await this.prisma.orderStatusDefinition.findFirst({
      where: { code: value, isActive: true },
      select: { code: true },
    })
    return byCode?.code ?? null
  }

  async syncOrderFromFlexi(flexiIdOrExt: string): Promise<void> {
    const doc = await this.client.fetchObjednavkaByExtId(flexiIdOrExt)
    if (!doc) return

    const extIds = this.asArray<string>(doc.id).map(String)
    const externalErpId =
      extIds.find((id) => id.startsWith('ext:GA:')) ??
      extIds.find((id) => id.startsWith('ext:')) ??
      (typeof doc.id === 'string' ? doc.id : null)

    let order =
      (externalErpId
        ? await this.prisma.order.findFirst({
            where: { externalErpId },
            select: { id: true, status: true, deliveryMethod: true },
          })
        : null) ?? null

    if (!order && externalErpId?.startsWith('ext:GA:')) {
      const orderId = externalErpId.slice('ext:GA:'.length)
      order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, status: true, deliveryMethod: true },
      })
    }

    if (!order) {
      this.logger.debug(`Flexi order ${flexiIdOrExt} not matched to local Order`)
      return
    }

    const data: {
      status?: string
      trackingNumber?: string | null
      trackingCarrier?: string | null
      shippedAt?: Date | null
      externalErpId?: string
    } = {}

    if (externalErpId) data.externalErpId = externalErpId

    const stav =
      String(doc.stavUzivK ?? doc.stavDoklObchK ?? doc['stavUzivK@showAs'] ?? '').trim() ||
      String(doc.zamekK ?? '').trim()
    if (stav) {
      const mapped = await this.resolveStatusCode(stav)
      if (mapped) data.status = mapped
    }

    const tracking = String(
      doc.cisloBaliku ?? doc.trackingCode ?? doc.varSymbol ?? doc['cisDosle'] ?? '',
    ).trim()
    if (tracking) {
      data.trackingNumber = tracking
      const carrierHint = order.deliveryMethod.includes('packeta')
        ? 'packeta'
          : order.deliveryMethod.includes('gls')
            ? 'gls'
            : order.deliveryMethod.includes('nova-poshta')
            ? 'nova-poshta'
            : null
      if (carrierHint) data.trackingCarrier = carrierHint
      if (!data.status) data.status = 'SHIPPED'
      data.shippedAt = new Date()
    }

    if (Object.keys(data).length === 0) return

    await this.prisma.order.update({
      where: { id: order.id },
      data,
    })
  }

  private asArray<T>(value: unknown): T[] {
    if (Array.isArray(value)) return value as T[]
    if (value !== undefined && value !== null) return [value as T]
    return []
  }

  async exportOrder(
    orderId: string,
    options?: { mode?: 'normal' | 'exception' },
  ): Promise<FlexiExportOrderResult> {
    const mode = options?.mode ?? 'normal'
    const configured = await this.isConfigured()
    if (!configured) {
      return { ok: false, message: 'ABRA Flexi не налаштовано.' }
    }

    const settings = await this.settings.getSettings()
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    })
    if (!order) return { ok: false, message: 'Замовлення не знайдено.' }

    if (mode === 'normal') {
      if (resolveErpSyncStatus(order.erpSyncStatus) === 'SYNCED' && order.externalErpId?.trim()) {
        return {
          ok: true,
          externalId: order.externalErpId,
          nativeId: order.erpNativeId ?? undefined,
          nativeKod: order.erpNativeKod ?? undefined,
          message: 'Замовлення вже експортовано в ABRA Flexi.',
        }
      }

      if (order.externalErpId?.trim() && resolveErpSyncStatus(order.erpSyncStatus) === 'NOT_REQUIRED') {
        return {
          ok: true,
          externalId: order.externalErpId,
          nativeId: order.erpNativeId ?? undefined,
          nativeKod: order.erpNativeKod ?? undefined,
          message: 'Замовлення вже експортовано в ABRA Flexi.',
        }
      }
    }

    const extId = `ext:GA:${order.id}`

    // ERP-CONNECTED-001: lost PUT / retry — if Flexi already has the doc, mark SYNCED (no second create).
    if (mode === 'normal') {
      try {
        const existingDoc = await this.client.fetchObjednavkaByExtId(extId)
        if (existingDoc) {
          const natives = await this.resolveNativeOrderIds(
            extId,
            existingDoc.id != null ? String(existingDoc.id).trim() || null : null,
          )
          const syncedAt = new Date()
          await this.prisma.order.update({
            where: { id: order.id },
            data: {
              externalErpId: extId,
              externalId1C: extId,
              erpNativeId: natives.nativeId,
              erpNativeKod: natives.nativeKod,
              erpSyncStatus: 'SYNCED',
              erpSyncedAt: syncedAt,
              erpLastSyncAt: syncedAt,
              erpLastErrorCode: null,
              erpLastErrorMessage: null,
            },
          })
          return {
            ok: true,
            externalId: extId,
            nativeId: natives.nativeId ?? undefined,
            nativeKod: natives.nativeKod ?? undefined,
            message: 'Замовлення вже існує в ABRA Flexi (GET-by-ext).',
          }
        }
      } catch (error) {
        this.logger.warn(
          `exportOrder(${orderId}) GET-before-PUT: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }

    const orderNumberLabel = `ZY-${String(order.orderNumber).padStart(8, '0')}`
    const stockCode = settings.defaultStockCode.trim()
    const useStock = Boolean(stockCode && !/^WH-MAIN$/i.test(stockCode))
    const reserveLines = mode === 'normal'

    const taxRate = order.taxRatePercent != null ? Number(order.taxRatePercent) : null
    const taxRegime = (order.taxRegime ?? '').trim()
    const isReverseCharge = taxRegime === 'reverse_charge'

    const applyLineVat = (line: Record<string, unknown>) => {
      // Abra main prices include VAT
      line.typCenyDphK = 'typCeny.sDph'
      if (isReverseCharge) {
        line.szbDph = 0
        line.typSzbDph = 'typSzbDph.dphOsv'
      } else if (taxRate != null && Number.isFinite(taxRate)) {
        line.szbDph = taxRate
      }
    }

    const lines = order.items
      .filter((item) => item.sku?.trim())
      .map((item) => {
        const line: Record<string, unknown> = {
          cenik: `code:${item.sku!.trim()}`,
          mnozMj: item.quantity,
          cenaMj: Number(item.priceAtPurchase),
          nazev: item.productName,
          rezervovat: reserveLines,
          rezervovatMj: reserveLines ? item.quantity : 0,
        }
        if (useStock) {
          line.sklad = `code:${stockCode}`
        }
        applyLineVat(line)
        return line
      })

    const deliveryAmount = order.deliveryAmount != null ? Number(order.deliveryAmount) : 0
    const packagingAmount = order.packagingAmount != null ? Number(order.packagingAmount) : 0
    const codFeeAmount = order.codFeeAmount != null ? Number(order.codFeeAmount) : 0
    const boxCount = order.packagingBoxCount ?? 0

    if (deliveryAmount > 0 && settings.shippingCenikKod.trim()) {
      const line: Record<string, unknown> = {
        cenik: `code:${settings.shippingCenikKod.trim()}`,
        mnozMj: 1,
        cenaMj: deliveryAmount,
        nazev: 'Doprava / Shipping',
      }
      applyLineVat(line)
      lines.push(line)
    }

    if (packagingAmount > 0 && settings.boxesCenikKod.trim()) {
      const line: Record<string, unknown> = {
        cenik: `code:${settings.boxesCenikKod.trim()}`,
        mnozMj: boxCount > 0 ? boxCount : 1,
        cenaMj: boxCount > 0 ? Math.round((packagingAmount / boxCount) * 100) / 100 : packagingAmount,
        nazev:
          boxCount > 0
            ? `Balenie / Boxes (${boxCount}${
                order.packagingPalletCount ? `, palety ${order.packagingPalletCount}` : ''
              })`
            : 'Balenie / Boxes',
      }
      applyLineVat(line)
      lines.push(line)
    }

    if (codFeeAmount > 0 && settings.codFeeCenikKod.trim()) {
      const line: Record<string, unknown> = {
        cenik: `code:${settings.codFeeCenikKod.trim()}`,
        mnozMj: 1,
        cenaMj: codFeeAmount,
        nazev: 'Dobierka / COD fee',
      }
      applyLineVat(line)
      lines.push(line)
    }

    if (lines.length === 0) {
      return { ok: false, message: 'Немає позицій із SKU для експорту в Flexi.' }
    }

    const isB2b = Boolean(order.companyIco?.trim() || order.companyVatId?.trim())
    const contactName = `${order.customerFirstName} ${order.customerLastName}`.trim()
    const receiverName = `${order.receiverFirstName} ${order.receiverLastName}`.trim()
    const hasDifferentReceiver =
      receiverName &&
      (order.receiverFirstName !== order.customerFirstName ||
        order.receiverLastName !== order.customerLastName ||
        order.receiverPhone !== order.customerPhone)

    const billingStreet = (order.companyStreet ?? '').trim()
    const shippingStreet = [order.deliveryStreet, order.deliveryHouseNumber]
      .filter(Boolean)
      .join(' ')
      .trim()
    const street = (isB2b && billingStreet) || shippingStreet
    const city = ((isB2b && order.companyCity?.trim()) || order.deliveryCity || '').trim()
    const branch = (order.deliveryBranch ?? '').trim()
    const branchLabel = (order.deliveryBranchLabel ?? '').trim()
    const billingPostal = (order.companyPostalCode ?? '').trim()
    const shippingPostal = (order.deliveryPostalCode ?? '').trim()
    const postal = (isB2b && billingPostal) || shippingPostal
    const countryCode = (
      order.deliveryCountryCode ||
      order.taxCountryCode ||
      ''
    )
      .trim()
      .toLowerCase()

    let firmaRef: string | null = null
    try {
      firmaRef = await this.ensureAdresarForOrder(order, isB2b, contactName, street, city, postal)
    } catch (error) {
      this.logger.warn(
        `exportOrder(${orderId}): adresar upsert failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    // SK deploy documents stay in EUR; HUF display is website-only.
    const orderCurrency = (order.currency || 'EUR').toUpperCase()
    const menaCode = orderCurrency === 'UAH' ? 'UAH' : 'EUR'
    const notes: string[] = []
    if (order.comment?.trim()) notes.push(order.comment.trim())
    if (order.preferredShipDate) {
      notes.push(`Datum odoslania: ${order.preferredShipDate.toISOString().slice(0, 10)}`)
    }
    if (branch) {
      notes.push(
        order.deliveryMethod === 'packeta-box'
          ? `PacketaPoint:${branch}${branchLabel ? ` — ${branchLabel}` : ''}`
          : `Výdajné miesto: ${branchLabel || branch}`,
      )
    }
    if (hasDifferentReceiver) {
      notes.push(
        `Prijímateľ: ${receiverName}, ${order.receiverPhone}${
          order.receiverCompanyName ? `, ${order.receiverCompanyName}` : ''
        }`,
      )
    }
    if (order.paymentMethod) {
      notes.push(`Platba: ${order.paymentMethod}`)
    }
    if (orderCurrency === 'HUF' && order.fxRateUsed) {
      notes.push(`Web mena: HUF, kurz EUR→HUF ${order.fxRateUsed}`)
    }
    if (isReverseCharge) {
      notes.push('VAT reverse charge (0% DPH) — prenesenie daňovej povinnosti.')
    } else if (taxRate != null && Number.isFinite(taxRate)) {
      notes.push(
        `DPH ${taxRate}% (${taxRegime || 'seller'}${
          order.taxCountryCode ? ` / ${order.taxCountryCode}` : ''
        })`,
      )
    }

    const document: Record<string, unknown> = {
      id: extId,
      typDokl: `code:${settings.orderDocTypeCode}`,
      typCenyDphK: 'typCeny.sDph',
      datVyst: order.createdAt.toISOString().slice(0, 10),
      cisDosle: orderNumberLabel,
      varSym: String(order.orderNumber),
      popis: `E-shop ${orderNumberLabel}`,
      poznam: notes.join('\n'),
      kontaktJmeno: hasDifferentReceiver ? receiverName : contactName,
      kontaktEmail: order.customerEmail ?? '',
      kontaktTel: hasDifferentReceiver ? order.receiverPhone : order.customerPhone,
      mena: `code:${menaCode}`,
      polozkyDokladu: lines,
    }

    if (settings.centerCode.trim()) {
      document.stredisko = `code:${settings.centerCode.trim()}`
    }
    if (mode === 'exception') {
      document.stavUzivK = FLEXI_ORDER_CONFLICT_USER_STATUS
    } else if (settings.orderUserStatus.trim()) {
      document.stavUzivK = settings.orderUserStatus.trim()
    }
    if (settings.issuedInvoiceTypeCode.trim()) {
      document.typDoklNabFak = `code:${settings.issuedInvoiceTypeCode.trim()}`
    }
    if (firmaRef) {
      document.firma = firmaRef
    }

    const nazFirmy = isB2b
      ? (order.companyLegalName?.trim() || contactName)
      : contactName
    document.nazFirmy = nazFirmy
    if (isB2b) {
      if (order.companyIco) document.ic = order.companyIco
      if (order.companyDic) document.dic = order.companyDic
      if (order.companyVatId) document.vatId = order.companyVatId
    }
    if (street) document.ulice = street
    if (city) document.mesto = city
    if (postal) document.psc = postal
    if (shippingPostal && shippingPostal !== postal) {
      notes.push(`PSČ doručenia: ${shippingPostal}`)
      document.poznam = notes.join('\n')
    }

    const statCode =
      menaCode === 'UAH'
        ? 'UA'
        : countryCode === 'hu'
          ? 'HU'
          : countryCode === 'at'
            ? 'AT'
            : countryCode === 'cz'
              ? 'CZ'
              : countryCode === 'sk' || !countryCode
                ? 'SK'
                : countryCode.toUpperCase()
    document.stat = `code:${statCode}`

    const dopravaParts = [order.deliveryMethod]
    if (order.deliveryMethod === 'packeta-box' && branch) {
      dopravaParts.push(`PacketaPoint:${branch}`)
    } else if (branchLabel || branch) {
      dopravaParts.push(branchLabel || branch)
    }
    if (shippingStreet || order.deliveryCity) {
      dopravaParts.push(
        [shippingStreet, order.deliveryCity, shippingPostal].filter(Boolean).join(', '),
      )
    }
    document.doprava = dopravaParts.filter(Boolean).join(' — ')

    if (order.preferredShipDate) {
      document.datTermin = order.preferredShipDate.toISOString().slice(0, 10)
    }

    applyFlexiOrderHeaderMapping(document, {
      createdAt: order.createdAt,
      paymentMethod: order.paymentMethod,
      deliveryMethod: order.deliveryMethod,
      deliveryBranch: order.deliveryBranch,
      deliveryMethodCodes: settings.deliveryMethodCodes,
    })

    const sendMode = this.resolveDocumentSendMode(isB2b, settings.documentSend)
    if (this.shouldSendAbraDocument(sendMode) && order.customerEmail) {
      document.stavMailK = 'stavMail.odeslat'
    }

    try {
      const write = await this.client.putObjednavkaPrijata(document)
      const natives = await this.resolveNativeOrderIds(extId, write.nativeId)
      if (mode === 'exception' && natives.nativeId) {
        await this.forceClearReservationOnDoc(natives.nativeId)
      }
      const syncedAt = new Date()
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          externalErpId: extId,
          externalId1C: extId,
          erpNativeId: natives.nativeId,
          erpNativeKod: natives.nativeKod,
          erpSyncStatus: mode === 'exception' ? 'ERP_CONFLICT' : 'SYNCED',
          erpSyncedAt: mode === 'exception' ? null : syncedAt,
          erpLastSyncAt: syncedAt,
          erpLastErrorCode: mode === 'exception' ? 'EXCEPTION_DOC_CREATED' : null,
          erpLastErrorMessage:
            mode === 'exception'
              ? 'ERP exception document without reservation (stavDoklObch.nespec).'
              : null,
        },
      })
      await this.settings.updateSettings({ lastExportAt: new Date().toISOString() })
      return {
        ok: true,
        externalId: extId,
        nativeId: natives.nativeId ?? undefined,
        nativeKod: natives.nativeKod ?? undefined,
        message:
          mode === 'exception'
            ? 'Створено exception-документ у Flexi без резерву (Nešpecifikované).'
            : 'Замовлення експортовано в ABRA Flexi.',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (mode === 'normal' && useStock && /sklad|notObjectIdentifier|rezervovat/i.test(message)) {
        try {
          for (const line of lines) {
            line.rezervovat = false
            line.rezervovatMj = 0
          }
          const write = await this.client.putObjednavkaPrijata(document)
          const natives = await this.resolveNativeOrderIds(extId, write.nativeId)
          if (natives.nativeId) {
            await this.forceClearReservationOnDoc(natives.nativeId)
          }
          const syncedAt = new Date()
          await this.prisma.order.update({
            where: { id: order.id },
            data: {
              externalErpId: extId,
              externalId1C: extId,
              erpNativeId: natives.nativeId,
              erpNativeKod: natives.nativeKod,
              erpSyncStatus: 'SYNCED',
              erpSyncedAt: syncedAt,
              erpLastSyncAt: syncedAt,
              erpLastErrorCode: null,
              erpLastErrorMessage: null,
            },
          })
          await this.settings.updateSettings({ lastExportAt: new Date().toISOString() })
          this.logger.warn(
            `exportOrder(${orderId}): rezervace rejected — exported with rezervovat=false.`,
          )
          return {
            ok: true,
            externalId: extId,
            nativeId: natives.nativeId ?? undefined,
            nativeKod: natives.nativeKod ?? undefined,
            message: `Експортовано без резерву (код «${stockCode}» або rezervace відхилено).`,
          }
        } catch (retryError) {
          const retryMessage =
            retryError instanceof Error ? retryError.message : String(retryError)
          this.logger.error(`exportOrder(${orderId}) failed: ${retryMessage}`)
          return { ok: false, message: retryMessage }
        }
      }
      this.logger.error(`exportOrder(${orderId}) failed: ${message}`)
      return { ok: false, message }
    }
  }

  /** Clear On stock reservation on all lines (auto-reserve may flip flags after PUT). */
  private async forceClearReservationOnDoc(nativeId: string): Promise<void> {
    try {
      const filter = encodeURIComponent(`id='${nativeId.replace(/'/g, "\\'")}'`)
      const listed = await this.client.request<unknown>(
        'GET',
        `/objednavka-prijata/(${filter}).json?detail=custom:id,polozkyObchDokladu(id)`,
      )
      const root =
        listed && typeof listed === 'object' && 'winstrom' in listed
          ? ((listed as { winstrom: Record<string, unknown> }).winstrom ?? {})
          : ((listed as Record<string, unknown>) ?? {})
      const docs = root['objednavka-prijata']
      const doc = (Array.isArray(docs) ? docs[0] : docs) as
        | { polozkyObchDokladu?: Array<{ id?: unknown }> | { id?: unknown } }
        | undefined
      const rawLines = doc?.polozkyObchDokladu
      const lineArr = Array.isArray(rawLines) ? rawLines : rawLines ? [rawLines] : []
      if (lineArr.length === 0) return
      await this.client.putObjednavkaPrijata({
        id: nativeId,
        polozkyObchDokladu: lineArr
          .filter((l) => l.id != null)
          .map((l) => ({
            id: String(l.id),
            rezervovat: false,
            rezervovatMj: 0,
          })),
      })
    } catch (error) {
      this.logger.warn(
        `forceClearReservationOnDoc(${nativeId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  /**
   * ERP-CONNECTED-001: native id from PUT results; kod via GET-by-ext (official PUT body has id, not always kod).
   */
  private async resolveNativeOrderIds(
    extId: string,
    putNativeId: string | null,
  ): Promise<{ nativeId: string | null; nativeKod: string | null }> {
    let nativeId = putNativeId
    let nativeKod: string | null = null
    try {
      const row = await this.client.fetchObjednavkaByExtId(extId)
      if (row) {
        if (!nativeId && row.id != null) nativeId = String(row.id).trim() || null
        if (row.kod != null && String(row.kod).trim()) nativeKod = String(row.kod).trim()
      }
    } catch (error) {
      this.logger.warn(
        `resolveNativeOrderIds(${extId}): ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    return { nativeId, nativeKod }
  }

  /**
   * On Flexi stock reject at checkout: push ERP available qty into Website DB (no inventing).
   */
  async applyCheckoutStockHints(
    unavailable: Array<{ sku: string; available: number }>,
  ): Promise<void> {
    for (const row of unavailable) {
      const sku = row.sku.trim()
      if (!sku) continue
      const stock = Math.max(0, Math.floor(Number(row.available) || 0))
      await this.prisma.productVariant.updateMany({
        where: { sku },
        data: { stock },
      })
    }
  }

  /**
   * REL-003: ERP-led cancel via official `@action=storno` (prefer native id).
   */
  async stornoOrder(orderId: string): Promise<{ ok: boolean; message: string }> {
    const configured = await this.isConfigured()
    if (!configured) {
      return { ok: false, message: 'ABRA Flexi не налаштовано.' }
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        erpNativeId: true,
        externalErpId: true,
        erpSyncStatus: true,
      },
    })
    if (!order) return { ok: false, message: 'Замовлення не знайдено.' }

    const targetId =
      order.erpNativeId?.trim() ||
      order.externalErpId?.trim() ||
      `ext:GA:${order.id}`

    try {
      await this.client.putObjednavkaAction('storno', targetId)
      const now = new Date()
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          erpSyncStatus: 'CANCEL_SYNCED',
          erpLastSyncAt: now,
          erpLastErrorCode: null,
          erpLastErrorMessage: null,
        },
      })
      return { ok: true, message: 'Замовлення сторновано в ABRA Flexi.' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error(`stornoOrder(${orderId}): ${message}`)
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          erpSyncStatus: 'CANCEL_SYNCED',
          erpLastSyncAt: new Date(),
          erpLastErrorCode: erpSyncErrorCodeForKind(classifyFlexiError(message)),
          erpLastErrorMessage: message,
        },
      })
      return { ok: false, message }
    }
  }

  /**
   * ERP-OFFLINE-001: BullMQ worker entry — updates sync state and throws on retryable failures.
   */
  async runExportOrderJob(
    orderId: string,
    meta: { attempt: number; maxAttempts: number },
  ): Promise<void> {
    const existing = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { erpSyncStatus: true, status: true },
    })
    if (!existing) {
      this.logger.warn(`runExportOrderJob(${orderId}): order not found`)
      return
    }

    if (existing.status === 'CANCELLED') {
      this.logger.log(`runExportOrderJob(${orderId}): order CANCELLED — skip export`)
      return
    }

    const resolved = resolveErpSyncStatus(existing.erpSyncStatus)
    if (
      resolved === 'SYNCED' ||
      resolved === 'FAILED' ||
      resolved === 'ERP_CONFLICT' ||
      resolved === 'CANCEL_PENDING_ERP' ||
      resolved === 'CANCEL_SYNCED'
    ) {
      return
    }

    const now = new Date()
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        erpSyncStatus: 'RETRYING',
        erpSyncAttempts: { increment: 1 },
        erpLastSyncAt: now,
      },
    })

    let result: FlexiExportOrderResult
    try {
      result = await this.exportOrder(orderId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result = { ok: false, message }
    }

    if (result.ok) {
      return
    }

    const kind = classifyFlexiError(result.message)
    const errorCode = erpSyncErrorCodeForKind(kind)

    if (kind === 'transport' || kind === 'auth') {
      const isFinalAttempt = meta.attempt >= meta.maxAttempts
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          erpSyncStatus: isFinalAttempt ? 'FAILED' : 'RETRYING',
          erpLastErrorCode: errorCode,
          erpLastErrorMessage: result.message,
          erpLastSyncAt: now,
        },
      })
      if (!isFinalAttempt) {
        throw new FlexiExportRetryError(result.message, errorCode)
      }
      return
    }

    if (kind === 'business') {
      // REL-003: late stock/business reject → exception doc (nespec, no reserve) + ERP_CONFLICT.
      // Do not blind stock++ on website.
      const exception = await this.exportOrder(orderId, { mode: 'exception' })
      if (exception.ok) {
        return
      }
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          erpSyncStatus: 'ERP_CONFLICT',
          erpLastErrorCode: errorCode,
          erpLastErrorMessage: `${result.message} | exception: ${exception.message}`,
          erpLastSyncAt: now,
        },
      })
      return
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        erpSyncStatus: 'FAILED',
        erpLastErrorCode: errorCode,
        erpLastErrorMessage: result.message,
        erpLastSyncAt: now,
      },
    })
  }

  async runStornoOrderJob(orderId: string): Promise<void> {
    const result = await this.stornoOrder(orderId)
    if (!result.ok) {
      const kind = classifyFlexiError(result.message)
      if (kind === 'transport' || kind === 'auth') {
        throw new FlexiExportRetryError(result.message, erpSyncErrorCodeForKind(kind))
      }
    }
  }

  private async ensureAdresarForOrder(
    order: {
      id: string
      userId: string | null
      customerEmail: string | null
      customerPhone: string
      companyLegalName: string | null
      companyIco: string | null
      companyDic: string | null
      companyVatId: string | null
      currency: string
    },
    isB2b: boolean,
    contactName: string,
    street: string,
    city: string,
    postal: string,
  ): Promise<string> {
    const cusExt =
      order.userId != null
        ? `ext:GA-CUS:${order.userId}`
        : `ext:GA-CUS-ORD:${order.id}`

    const existingByExt = await this.client.findAdresarByExtId(cusExt)
    if (existingByExt?.id != null) {
      return cusExt
    }

    if (isB2b && order.companyIco?.trim()) {
      const byIc = await this.client.findAdresarByIc(order.companyIco.trim())
      if (byIc?.id != null) {
        const kod = byIc.kod != null ? String(byIc.kod) : null
        if (kod) return `code:${kod}`
        return String(byIc.id)
      }
    }

    if (order.customerEmail?.trim()) {
      const byEmail = await this.client.findAdresarByEmail(order.customerEmail.trim())
      if (byEmail?.id != null && !isB2b) {
        const kod = byEmail.kod != null ? String(byEmail.kod) : null
        if (kod) return `code:${kod}`
        return String(byEmail.id)
      }
    }

    const adresar: Record<string, unknown> = {
      id: cusExt,
      nazev: isB2b
        ? (order.companyLegalName?.trim() || contactName)
        : contactName,
      email: order.customerEmail ?? '',
      mobil: order.customerPhone,
      tel: order.customerPhone,
    }
    if (isB2b) {
      if (order.companyIco) adresar.ic = order.companyIco
      if (order.companyDic) adresar.dic = order.companyDic
      if (order.companyVatId) adresar.vatId = order.companyVatId
    }
    if (street) adresar.ulice = street
    if (city) adresar.mesto = city
    if (postal) adresar.psc = postal
    adresar.stat = order.currency === 'UAH' ? 'code:UA' : 'code:SK'

    await this.client.putAdresar(adresar)
    return cusExt
  }

  /** Prefer Strom catalog sync; orphans for leftover SKUs. */
  async importNewProducts(): Promise<FlexiImportResult> {
    const settings = await this.settings.getSettings()
    if (!settings.defaultCategoryId && settings.syncCategoriesFromStrom) {
      // Strom can still create categories; orphans need fallback
    } else if (!settings.defaultCategoryId) {
      throw new BadRequestException(
        'Вкажіть fallback-категорію сайту (defaultCategoryId) перед імпортом.',
      )
    }

    const strom = await this.syncStromCatalog()
    return {
      ok: strom.ok,
      created: strom.productsUpserted + strom.orphansCreated,
      skippedExisting: 0,
      skippedNoSku: 0,
      skippedNoStock: 0,
      errors: strom.errors,
      message: strom.message,
    }
  }

  async registerWebhook(): Promise<{ ok: boolean; message: string; remoteId?: string }> {
    const settings = await this.settings.getSettings()
    if (!settings.webhookUrl || !settings.webhookSecKey) {
      return {
        ok: false,
        message: 'Вкажіть webhookUrl та webhookSecKey перед реєстрацією hook у Flexi.',
      }
    }

    const normalizeUrl = (u: string) => u.trim().replace(/\/$/, '').toLowerCase()
    const wanted = normalizeUrl(settings.webhookUrl)

    try {
      // Idempotent: reuse existing remote hook with same URL (LIVE-VERIFIED GET /hooks)
      const existing = await this.client.listHooks()
      const match = existing.find((h) => normalizeUrl(h.url) === wanted)
      if (match) {
        await this.settings.updateSettings({
          webhookAccepting: true,
          webhookRemoteId: match.id,
          webhookLastRegisterAt: new Date().toISOString(),
          webhookLastError: '',
        })
        return {
          ok: true,
          remoteId: match.id,
          message: `Webhook уже зареєстровано в Flexi (id=${match.id}). Дублікат не створювався. Changes API poll залишається активним.`,
        }
      }

      const skipUrlTest =
        settings.webhookUrl.includes('localhost') || settings.webhookUrl.includes('127.0.0.1')
      await this.client.registerWebhook(
        settings.webhookUrl,
        settings.webhookSecKey,
        settings.globalVersion,
        skipUrlTest,
      )

      const after = await this.client.listHooks()
      const created = after.find((h) => normalizeUrl(h.url) === wanted)
      await this.settings.updateSettings({
        webhookAccepting: true,
          webhookRemoteId: created?.id ?? '',
          webhookLastRegisterAt: new Date().toISOString(),
          webhookLastError: '',
        })

      return {
        ok: true,
        remoteId: created?.id,
        message: created
          ? `Webhook зареєстровано в ABRA Flexi (id=${created.id}, format=JSON). Вимкнення webhook ≠ вимкнення ERP sync.`
          : 'Webhook PUT виконано; id не знайдено в GET /hooks — статус UNKNOWN до наступної перевірки.',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.settings.updateSettings({ webhookLastError: message.slice(0, 2000) })
      return { ok: false, message }
    }
  }

  /**
   * Disable WebHook only: stop local intake + DELETE remote hook(s) matching our URL.
   * Does NOT disable Flexi enabled, Changes poll, or ERP sync.
   */
  async disableWebhook(): Promise<{ ok: boolean; message: string }> {
    const settings = await this.settings.getSettings()
    const normalizeUrl = (u: string) => u.trim().replace(/\/$/, '').toLowerCase()
    const wanted = settings.webhookUrl ? normalizeUrl(settings.webhookUrl) : ''

    try {
      let deleted = 0
      const hooks = await this.client.listHooks()
      const targets = hooks.filter((h) => {
        if (settings.webhookRemoteId && h.id === settings.webhookRemoteId) return true
        if (wanted && normalizeUrl(h.url) === wanted) return true
        return false
      })

      for (const hook of targets) {
        await this.client.deleteHook(hook.id)
        deleted += 1
      }

      // Confirm
      const remaining = wanted
        ? (await this.client.listHooks()).filter((h) => normalizeUrl(h.url) === wanted)
        : []
      if (remaining.length > 0) {
        const message = `Локально webhookAccepting=false, але у Flexi лишилось ${remaining.length} hook(ів) з нашим URL.`
        await this.settings.updateSettings({
          webhookAccepting: false,
          webhookLastError: message,
        })
        return { ok: false, message }
      }

      await this.settings.updateSettings({
        webhookAccepting: false,
        webhookRemoteId: '',
        webhookLastError: '',
      })
      return {
        ok: true,
        message: `Webhook вимкнено (deleted=${deleted}). Changes API poll / ERP sync продовжують працювати.`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // Still stop local intake even if remote delete fails — do not claim unregister succeeded
      await this.settings.updateSettings({
        webhookAccepting: false,
        webhookLastError: message.slice(0, 2000),
      })
      return {
        ok: false,
        message: `Локальний прийом webhook зупинено, але remote unregister не підтверджено: ${message}`,
      }
    }
  }

  /** Refresh registration status from live GET /hooks (does not change accepting flag). */
  async refreshWebhookStatus(): Promise<{
    ok: boolean
    status: string
    remoteId?: string
    remoteUrl?: string
    hooksCount: number
    message: string
  }> {
    const settings = await this.settings.getSettings()
    try {
      const hooks = await this.client.listHooks()
      const normalizeUrl = (u: string) => u.trim().replace(/\/$/, '').toLowerCase()
      const wanted = settings.webhookUrl ? normalizeUrl(settings.webhookUrl) : ''
      const match =
        hooks.find((h) => settings.webhookRemoteId && h.id === settings.webhookRemoteId) ??
        hooks.find((h) => wanted && normalizeUrl(h.url) === wanted)

      if (match && match.id !== settings.webhookRemoteId) {
        await this.settings.updateSettings({ webhookRemoteId: match.id, webhookLastError: undefined })
      } else if (!match && settings.webhookRemoteId) {
        await this.settings.updateSettings({ webhookRemoteId: '' })
      }

      const next = await this.settings.getSettings()
      let status = this.settings.deriveWebhookStatus(next)
      if (match && next.webhookAccepting !== false) status = 'REGISTERED'
      if (!match && next.webhookAccepting !== false && next.webhookUrl) status = 'NOT_REGISTERED'
      if (next.webhookAccepting === false) status = match ? 'UNKNOWN' : 'DISABLED'

      return {
        ok: true,
        status,
        remoteId: match?.id,
        remoteUrl: match?.url,
        hooksCount: hooks.length,
        message: match
          ? `Знайдено remote hook id=${match.id}`
          : 'Remote hook з нашим URL не знайдено',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.settings.updateSettings({ webhookLastError: message.slice(0, 2000) })
      return { ok: false, status: 'ERROR', hooksCount: 0, message }
    }
  }
}
