import { Injectable } from '@nestjs/common'

import { FlexiClient } from '../flexi/flexi.client'
import { matchesSizeLabel, parseSizeLabel } from '../flexi/flexi-size-label'
import { FlexiSettingsService } from '../flexi/flexi.settings.service'
import { ProductSearchService } from '../search/product-search.service'
import { PrismaService } from '../prisma/prisma.service'
import type {
  GeminiParsedInvoice,
  InvoiceLinePreview,
  MatchedFlexiCenikSummary,
  MatchedProductSummary,
  SupplierInvoiceParseOptions,
} from './supplier-invoice.types'

@Injectable()
export class InvoiceProductMatcherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productSearch: ProductSearchService,
    private readonly flexiClient: FlexiClient,
    private readonly flexiSettings: FlexiSettingsService,
  ) {}

  async matchInvoice(
    parsed: GeminiParsedInvoice,
    options: SupplierInvoiceParseOptions,
  ): Promise<InvoiceLinePreview[]> {
    const eans = [...new Set(parsed.items.map((i) => i.ean?.trim()).filter(Boolean))] as string[]

    // Only look up site variants by EAN — supplier Index/SKU (e.g. 1-71845-08) is never our Abra kod.
    const variants =
      eans.length > 0
        ? await this.prisma.productVariant.findMany({
            where: { ean: { in: eans } },
            select: variantSelect(options.locale),
          })
        : []

    const byEan = new Map(variants.filter((v) => v.ean).map((v) => [v.ean as string, v]))

    const settings = await this.flexiSettings.getSettings()
    const serviceKodByAlias = buildServiceKodAliases(settings.boxesCenikKod, settings.shippingCenikKod)

    const lines: InvoiceLinePreview[] = []
    for (const item of parsed.items) {
      lines.push(await this.matchLine(item, options, byEan, serviceKodByAlias))
    }
    return lines
  }

  private async matchLine(
    item: GeminiParsedInvoice['items'][number],
    options: SupplierInvoiceParseOptions,
    byEan: Map<string, VariantRow>,
    serviceKodByAlias: Map<string, string>,
  ): Promise<InvoiceLinePreview> {
    const unmatched = (): InvoiceLinePreview => ({
      ...item,
      matchedProduct: null,
      matchedFlexiCenik: null,
      fuzzyCandidates: [],
      matchConfidence: 'none',
      matchSource: 'none',
      suggestedAbraId: null,
    })

    const ean = item.ean?.trim()
    const rawName = item.rawName.trim()
    const wantedSize = resolveWantedSize(rawName, options.defaultSizeLabel)

    if (ean && byEan.has(ean)) {
      const variant = byEan.get(ean)!
      if (variantMatchesWantedSize(variant, wantedSize)) {
        return {
          ...item,
          matchedProduct: toProductSummary(variant),
          matchedFlexiCenik: null,
          fuzzyCandidates: [],
          matchConfidence: 'exact',
          matchSource: 'site-db',
          suggestedAbraId: variant.sku,
        }
      }
    }

    // Service lines only (BOXES, SHIPPING COSTS) — never treat supplier Index as Abra kod.
    const serviceKod = resolveServiceKod(rawName, serviceKodByAlias)
    if (serviceKod) {
      const flexiByKod = await this.flexiClient.fetchCenikByKod(serviceKod)
      if (flexiByKod) {
        return {
          ...item,
          matchedProduct: null,
          matchedFlexiCenik: toFlexiSummary(flexiByKod),
          fuzzyCandidates: [],
          matchConfidence: 'exact',
          matchSource: 'flexi-cenik',
          suggestedAbraId: flexiByKod.kod,
        }
      }
      // Known alias even if Flexi fetch fails — still use configured kod.
      return {
        ...item,
        matchedProduct: null,
        matchedFlexiCenik: { id: '', kod: serviceKod, nazev: rawName },
        fuzzyCandidates: [],
        matchConfidence: 'exact',
        matchSource: 'flexi-cenik',
        suggestedAbraId: serviceKod,
      }
    }

    if (!rawName) return unmatched()

    const searchName = stripSizeSuffix(rawName)
    const flexiCandidates = await this.searchFlexiByName(searchName, wantedSize)
    if (flexiCandidates.length > 0) {
      const best = flexiCandidates[0]
      return {
        ...item,
        matchedProduct: null,
        matchedFlexiCenik: best,
        fuzzyCandidates: flexiCandidates.slice(0, 5),
        matchConfidence: 'fuzzy',
        matchSource: 'flexi-cenik',
        suggestedAbraId: best.kod,
      }
    }

    const siteResult = await this.productSearch.search(
      searchName,
      { locale: options.locale, published: undefined },
      1,
      5,
    )
    if (siteResult.ids.length > 0) {
      const siteVariants = await this.prisma.productVariant.findMany({
        where: { productId: siteResult.ids[0] },
        select: variantSelect(options.locale),
        orderBy: { sku: 'asc' },
      })
      const variant = pickVariantForSize(siteVariants, wantedSize)
      if (variant?.sku) {
        return {
          ...item,
          matchedProduct: toProductSummary(variant),
          matchedFlexiCenik: null,
          fuzzyCandidates: [],
          matchConfidence: 'fuzzy',
          matchSource: 'site-db',
          suggestedAbraId: variant.sku,
        }
      }
    }

    return unmatched()
  }

  private async searchFlexiByName(
    rawName: string,
    wantedSize: string,
  ): Promise<MatchedFlexiCenikSummary[]> {
    const sizeSuffix = wantedSize.trim()
    const nameQueries = buildNameSearchQueries(rawName)

    const seen = new Set<string>()
    const rows: Array<{ id: string; kod: string; nazev: string }> = []

    const collect = async (q: string, size?: string) => {
      const found = await this.flexiClient.searchCenikByNameFragment(q, 80, size)
      for (const row of found) {
        if (seen.has(row.id)) continue
        if (isSupplierForeignSku(row.kod)) continue
        seen.add(row.id)
        rows.push(row)
      }
    }

    // Flexi: begins + ends(size). Client then ranks by full cultivar name.
    if (sizeSuffix) {
      for (const q of nameQueries) {
        await collect(q, sizeSuffix)
      }
    } else {
      for (const q of nameQueries) {
        await collect(q)
        if (rows.length >= 20) break
      }
    }

    if (rows.length === 0) return []

    const sized = sizeSuffix
      ? rows.filter((row) => matchesSizeLabel(row.kod, row.nazev, sizeSuffix))
      : rows

    if (sizeSuffix && sized.length === 0) return []

    const ranked = [...sized]
      .map((row) => ({ row, score: scoreNameMatch(rawName, row.nazev) }))
      .filter((x) => x.score < 10)
      .sort((a, b) => a.score - b.score)

    return ranked.slice(0, 5).map(({ row }) => ({ id: row.id, kod: row.kod, nazev: row.nazev }))
  }
}

type VariantRow = {
  id: string
  sku: string | null
  ean: string | null
  productId: string
  product: {
    slug: string
    translations: Array<{ name: string }>
  }
  attributeValues: Array<{
    value: {
      slug: string
      translations: Array<{ label: string }>
    }
  }>
}

function variantSelect(locale: string) {
  return {
    id: true,
    sku: true,
    ean: true,
    productId: true,
    product: {
      select: {
        slug: true,
        translations: {
          where: { locale },
          select: { name: true },
          take: 1,
        },
      },
    },
    attributeValues: {
      select: {
        value: {
          select: {
            slug: true,
            translations: { select: { label: true }, take: 4 },
          },
        },
      },
    },
  } as const
}

function toProductSummary(variant: VariantRow): MatchedProductSummary {
  return {
    productId: variant.productId,
    variantId: variant.id,
    slug: variant.product.slug,
    name: variant.product.translations[0]?.name ?? variant.product.slug,
    sku: variant.sku,
    ean: variant.ean,
  }
}

function toFlexiSummary(item: { id: string; kod: string; nazev: string }): MatchedFlexiCenikSummary {
  return { id: item.id, kod: item.kod, nazev: item.nazev }
}

function buildServiceKodAliases(boxesKod: string, shippingKod: string): Map<string, string> {
  const map = new Map<string, string>()
  const boxes = boxesKod.trim() || 'BOXES'
  const shipping = shippingKod.trim() || 'SHIPPING'
  for (const alias of ['BOXES', 'BOX', 'PACKAGING', 'PACKAGE', 'CARTON', 'CARTONS']) {
    map.set(alias, boxes)
  }
  for (const alias of [
    'SHIPPING',
    'SHIPPING COSTS',
    'SHIPPING COST',
    'FREIGHT',
    'TRANSPORT',
    'DELIVERY',
    'TRANSPORT COSTS',
    'TRANSPORT COST',
  ]) {
    map.set(alias, shipping)
  }
  return map
}

function resolveServiceKod(rawName: string, serviceKodByAlias: Map<string, string>): string | null {
  const upper = rawName.trim().toUpperCase().replace(/\s+/g, ' ')
  if (!upper) return null
  return serviceKodByAlias.get(upper) ?? null
}

/** Vitroflora / nursery Index codes must never become Abra kod. */
export function isSupplierForeignSku(sku: string): boolean {
  const t = sku.trim()
  if (!t) return false
  // e.g. 1-71845-08, 1-75502-02
  if (/^\d{1,4}-\d{3,8}(-\d{1,4})?$/.test(t)) return true
  // pure numeric auto ids
  if (/^\d{4,}$/.test(t)) return true
  return false
}

/** Size from end of invoice name, else import setting (C2 / CUT / …). */
export function resolveWantedSize(rawName: string, defaultSizeLabel: string): string {
  return parseSizeLabel('', rawName)?.trim() || defaultSizeLabel.trim()
}

export function stripSizeSuffix(rawName: string): string {
  return rawName
    .replace(/\s*[-–—]\s*((?:P|C)\d+(?:\.\d+)?L?|CUT|GROW)\s*$/i, '')
    .trim()
}

function pickVariantForSize(variants: VariantRow[], wantedSize: string): VariantRow | null {
  if (variants.length === 0) return null
  const wanted = wantedSize.trim().toUpperCase()
  if (!wanted) return variants.find((v) => v.sku && !isSupplierForeignSku(v.sku)) ?? null

  const sized = variants.filter((variant) => variantMatchesWantedSize(variant, wanted))
  return sized.find((v) => v.sku && !isSupplierForeignSku(v.sku)) ?? null
}

function variantMatchesWantedSize(variant: VariantRow, wantedSize: string): boolean {
  const wanted = wantedSize.trim().toUpperCase()
  if (!wanted) return true
  return collectVariantSizeLabels(variant).includes(wanted)
}

function collectVariantSizeLabels(variant: VariantRow): string[] {
  const labels = new Set<string>()
  if (variant.sku) {
    const fromSku = parseSizeLabel(variant.sku, '')
    if (fromSku) labels.add(fromSku.toUpperCase())
  }
  for (const av of variant.attributeValues) {
    const slug = av.value.slug?.trim().toUpperCase()
    if (slug) labels.add(slug)
    for (const tr of av.value.translations) {
      const label = tr.label?.trim().toUpperCase()
      if (label) labels.add(label)
    }
  }
  return [...labels]
}

/** Lower is better. <10 = acceptable match. */
function scoreNameMatch(query: string, nazev: string): number {
  const q = normalizeName(query)
  const n = normalizeName(nazev)
  if (!q || !n) return 10
  if (n === q) return 0
  if (n.startsWith(q) || n.includes(q)) return 1
  // Invoice name longer (extra junk) but Flexi name is contained in it
  if (q.includes(n) && n.length >= 8) return 2

  const qTokens = q.split(' ').filter((t) => t.length > 1)
  if (qTokens.length === 0) return 10
  const nTokens = new Set(n.split(' ').filter(Boolean))
  const hits = qTokens.filter((t) => nTokens.has(t)).length
  const ratio = hits / qTokens.length
  // Require most significant tokens (genus/species/cultivar), allow missing EU/PP noise
  if (ratio >= 0.8 && hits >= 2) return 3
  if (ratio >= 0.65 && hits >= 3) return 4
  return 10
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[''`´]/g, '')
    .replace(/[®™©]/g, '')
    // Plant breeders' rights / patent numbers often stuck on invoice descriptions
    .replace(/\b(?:eu|pp)\d+\b/gi, ' ')
    .replace(/\bpbr\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–—]\s*(c\d+(?:\.\d+)?l?|p\d+(?:\.\d+)?l?|cut|grow)\s*$/i, '')
    .trim()
}

/**
 * Prefixes for Flexi begins search — genus (+ species when present).
 */
function buildNameSearchQueries(rawName: string): string[] {
  const base = stripSizeSuffix(rawName)
    .replace(/[''`´®™]/g, '')
    .replace(/\b(?:eu|pp)\d+\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!base) return []
  const words = base.split(' ').filter(Boolean)
  const out: string[] = []
  if (words.length >= 2) out.push(`${words[0]} ${words[1]}`)
  if (words.length >= 1) out.push(words[0])
  if (words.length >= 3) out.push(words.slice(0, 3).join(' '))
  return [...new Set(out.filter((q) => q.length >= 3))]
}
