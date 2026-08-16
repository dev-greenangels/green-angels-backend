import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { randomUUID } from 'crypto'

import { CatalogMediaService } from '../media/catalog-media.service'
import { processProductImage } from '../media/media-image.process'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import { parseDelimitedCsv } from './csv.util'

const STATUS_KEY = 'feature.prestaProductImageImportStatus'
const QUEUE_KEY = 'feature.prestaProductImageImportQueue'

export type ProductImageImportStatus = {
  status: 'idle' | 'running' | 'completed' | 'error' | 'cancelled'
  total: number
  processed: number
  imported: number
  updated: number
  skipped: number
  /** Реальні збої (HTTP / JPEG / товар не знайдено), окремо від «уже імпортовано». */
  failed: number
  startedAt: string | null
  finishedAt: string | null
  cancelRequested: boolean
  currentImageId: string | null
  errors: Array<{ sourceId: string; error: string }>
}

type QueueRow = {
  productLegacyId: string
  imageLegacyId: string
  position: number
  cover: boolean
}

const DEFAULT_STATUS: ProductImageImportStatus = {
  status: 'idle',
  total: 0,
  processed: 0,
  imported: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  startedAt: null,
  finishedAt: null,
  cancelRequested: false,
  currentImageId: null,
  errors: [],
}

@Injectable()
export class ProductImageImportService {
  private readonly logger = new Logger(ProductImageImportService.name)
  private running = false
  private cancelRequested = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly catalogMedia: CatalogMediaService,
  ) {}

  async getStatus(): Promise<ProductImageImportStatus> {
    const row = await this.prisma.settings.findUnique({ where: { key: STATUS_KEY } })
    return this.normalizeStatus(row?.value ? this.safeParse(row.value) : null)
  }

  async cancel(): Promise<ProductImageImportStatus> {
    const current = await this.getStatus()
    if (current.status !== 'running') return current
    this.cancelRequested = true
    const next: ProductImageImportStatus = { ...current, cancelRequested: true }
    await this.saveStatus(next)
    return next
  }

  async start(csvBuffer: Buffer): Promise<ProductImageImportStatus> {
    if (this.running) {
      throw new ConflictException('Імпорт зображень уже виконується.')
    }

    const content = csvBuffer.toString('utf-8').replace(/^\uFEFF/, '')
    const rows = parseDelimitedCsv(content, ';')
      .map((r) => {
        const productLegacyId = r.id_product?.trim()
        const imageLegacyId = r.id_image?.trim()
        if (!productLegacyId || !imageLegacyId) return null
        return {
          productLegacyId,
          imageLegacyId,
          position: Number(r.position || 0) || 0,
          cover: r.cover?.trim() === '1',
        } satisfies QueueRow
      })
      .filter((r): r is QueueRow => r != null)

    if (rows.length === 0) {
      throw new BadRequestException('CSV зображень порожній.')
    }

    const initial: ProductImageImportStatus = {
      ...DEFAULT_STATUS,
      status: 'running',
      total: rows.length,
      startedAt: new Date().toISOString(),
    }
    await this.saveQueue(rows)
    await this.saveStatus(initial)
    this.cancelRequested = false
    this.running = true
    void this.runLoop(rows)
    return initial
  }

  private async runLoop(rows: QueueRow[]) {
    const errors: ProductImageImportStatus['errors'] = []
    let imported = 0
    let updated = 0
    let skipped = 0
    let failed = 0
    let processed = 0
    let startedAt = (await this.getStatus()).startedAt

    const snapshot = (
      status: ProductImageImportStatus['status'],
      extra?: Partial<ProductImageImportStatus>,
    ): ProductImageImportStatus => ({
      status,
      total: rows.length,
      processed,
      imported,
      updated,
      skipped,
      failed,
      startedAt,
      finishedAt: null,
      cancelRequested: false,
      currentImageId: null,
      errors,
      ...extra,
    })

    try {
      const presta = await this.settings.getPrestaImportSettings()
      const template = presta.productImageUrlTemplate

      const products = await this.prisma.product.findMany({
        where: { legacyId: { not: null } },
        select: { id: true, legacyId: true, slug: true },
      })
      const productByLegacy = new Map(
        products.map((p) => [
          p.legacyId!,
          { id: p.id, linkRewrite: p.slug.replace(/^\d+-/, '') },
        ]),
      )

      for (const row of rows) {
        if (this.shouldCancel()) {
          await this.saveStatus(
            snapshot('cancelled', {
              finishedAt: new Date().toISOString(),
              cancelRequested: true,
            }),
          )
          return
        }

        processed++
        await this.saveStatus(
          snapshot('running', {
            currentImageId: row.imageLegacyId,
            startedAt,
          }),
        )

        const product = productByLegacy.get(row.productLegacyId)
        if (!product) {
          failed++
          this.pushError(errors, row.imageLegacyId, `Товар ${row.productLegacyId} не знайдено`)
          continue
        }

        const existing = await this.prisma.productImage.findUnique({
          where: { legacyId: row.imageLegacyId },
        })
        if (existing) {
          skipped++
          continue
        }

        const remoteUrl = template
          .replaceAll('{id_image}', row.imageLegacyId)
          .replaceAll('{link_rewrite}', product.linkRewrite)

        try {
          const imgRes = await fetch(remoteUrl, {
            headers: { 'User-Agent': 'GreenAngelsImport/1.0' },
            signal: AbortSignal.timeout(45_000),
          })
          if (!imgRes.ok) {
            failed++
            this.pushError(errors, row.imageLegacyId, `HTTP ${imgRes.status}: ${remoteUrl}`)
            continue
          }

          const buffer = Buffer.from(await imgRes.arrayBuffer())
          const imageId = randomUUID()
          const { main, thumb } = await processProductImage(buffer)
          const url = await this.catalogMedia.putProcessedProductFiles(
            product.id,
            imageId,
            main,
            thumb,
          )
          const isMain = row.cover || row.position <= 1

          await this.prisma.productImage.create({
            data: {
              productId: product.id,
              legacyId: row.imageLegacyId,
              url,
              isMain,
              sortOrder: row.position,
            },
          })
          imported++
        } catch (err) {
          failed++
          this.pushError(
            errors,
            row.imageLegacyId,
            err instanceof Error ? err.message : 'Помилка завантаження',
          )
        }
      }

      await this.saveStatus(
        snapshot('completed', {
          finishedAt: new Date().toISOString(),
        }),
      )
    } catch (err) {
      this.logger.error(err)
      failed++
      this.pushError(
        errors,
        'job',
        err instanceof Error ? err.message : 'Невідома помилка імпорту',
      )
      await this.saveStatus(
        snapshot('error', {
          finishedAt: new Date().toISOString(),
        }),
      )
    } finally {
      this.running = false
      this.cancelRequested = false
      await this.clearQueue()
    }
  }

  private shouldCancel() {
    return this.cancelRequested
  }

  private pushError(
    errors: ProductImageImportStatus['errors'],
    sourceId: string,
    error: string,
  ) {
    errors.push({ sourceId, error })
  }

  private async saveStatus(status: ProductImageImportStatus) {
    await this.prisma.settings.upsert({
      where: { key: STATUS_KEY },
      create: { key: STATUS_KEY, value: JSON.stringify(status) },
      update: { value: JSON.stringify(status) },
    })
  }

  private async saveQueue(rows: QueueRow[]) {
    await this.prisma.settings.upsert({
      where: { key: QUEUE_KEY },
      create: { key: QUEUE_KEY, value: JSON.stringify(rows) },
      update: { value: JSON.stringify(rows) },
    })
  }

  private async clearQueue() {
    await this.prisma.settings.deleteMany({ where: { key: QUEUE_KEY } })
  }

  private safeParse(raw: string): unknown {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  private normalizeStatus(raw: unknown): ProductImageImportStatus {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATUS }
    const value = raw as Partial<ProductImageImportStatus>
    return {
      status:
        value.status === 'running' ||
        value.status === 'completed' ||
        value.status === 'error' ||
        value.status === 'cancelled' ||
        value.status === 'idle'
          ? value.status
          : 'idle',
      total: typeof value.total === 'number' ? value.total : 0,
      processed: typeof value.processed === 'number' ? value.processed : 0,
      imported: typeof value.imported === 'number' ? value.imported : 0,
      updated: typeof value.updated === 'number' ? value.updated : 0,
      skipped: typeof value.skipped === 'number' ? value.skipped : 0,
      failed:
        typeof value.failed === 'number'
          ? value.failed
          : Array.isArray(value.errors)
            ? value.errors.length
            : 0,
      startedAt: typeof value.startedAt === 'string' ? value.startedAt : null,
      finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt : null,
      cancelRequested: Boolean(value.cancelRequested),
      currentImageId: typeof value.currentImageId === 'string' ? value.currentImageId : null,
      errors: Array.isArray(value.errors)
        ? value.errors.filter((e): e is { sourceId: string; error: string } =>
            Boolean(e && typeof e === 'object' && (e as { sourceId?: string }).sourceId),
          )
        : [],
    }
  }
}
