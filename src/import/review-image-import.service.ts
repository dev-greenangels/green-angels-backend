import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { randomUUID } from 'crypto'
import sharp from 'sharp'

import { CatalogMediaService } from '../media/catalog-media.service'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import { parseDelimitedCsv } from './csv.util'

const STATUS_KEY = 'feature.prestaReviewImageImportStatus'
const MAX_REVIEW_IMAGES = 3

export type ReviewImageImportStatus = {
  status: 'idle' | 'running' | 'completed' | 'error' | 'cancelled'
  total: number
  processed: number
  imported: number
  skipped: number
  failed: number
  startedAt: string | null
  finishedAt: string | null
  cancelRequested: boolean
  currentImageId: string | null
  errors: Array<{ sourceId: string; error: string }>
}

type QueueRow = {
  commentLegacyId: string
  imageLegacyId: string
}

const DEFAULT_STATUS: ReviewImageImportStatus = {
  status: 'idle',
  total: 0,
  processed: 0,
  imported: 0,
  skipped: 0,
  failed: 0,
  startedAt: null,
  finishedAt: null,
  cancelRequested: false,
  currentImageId: null,
  errors: [],
}

@Injectable()
export class ReviewImageImportService {
  private readonly logger = new Logger(ReviewImageImportService.name)
  private running = false
  private cancelRequested = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly catalogMedia: CatalogMediaService,
  ) {}

  async getStatus(): Promise<ReviewImageImportStatus> {
    const row = await this.prisma.settings.findUnique({ where: { key: STATUS_KEY } })
    return this.normalizeStatus(row?.value ? this.safeParse(row.value) : null)
  }

  async cancel(): Promise<ReviewImageImportStatus> {
    const current = await this.getStatus()
    if (current.status !== 'running') return current
    this.cancelRequested = true
    const next = { ...current, cancelRequested: true }
    await this.saveStatus(next)
    return next
  }

  async start(csvBuffer: Buffer): Promise<ReviewImageImportStatus> {
    if (this.running) {
      throw new ConflictException('Імпорт фото відгуків уже виконується.')
    }

    const content = csvBuffer.toString('utf-8').replace(/^\uFEFF/, '')
    const rows = parseDelimitedCsv(content, ';')
      .map((r) => this.mapRow(r))
      .filter((r): r is QueueRow => r != null)

    if (rows.length === 0) {
      throw new BadRequestException('CSV фото відгуків порожній.')
    }

    const initial: ReviewImageImportStatus = {
      ...DEFAULT_STATUS,
      status: 'running',
      total: rows.length,
      startedAt: new Date().toISOString(),
    }
    await this.saveStatus(initial)
    this.cancelRequested = false
    this.running = true
    void this.runLoop(rows)
    return initial
  }

  private mapRow(row: Record<string, string>): QueueRow | null {
    const commentLegacyId = this.field(row, 'id_product_comment', 'Comment ID', 'id_comment')
    const imageLegacyId = this.field(row, 'id_image', 'image_legacy_id')
    if (!commentLegacyId || !imageLegacyId) return null
    return { commentLegacyId, imageLegacyId }
  }

  private field(row: Record<string, string>, ...names: string[]): string {
    for (const name of names) {
      const direct = row[name]?.trim()
      if (direct) return direct
    }
    const lower = new Map(Object.keys(row).map((key) => [key.toLowerCase(), key]))
    for (const name of names) {
      const key = lower.get(name.toLowerCase())
      if (key) {
        const value = row[key]?.trim()
        if (value) return value
      }
    }
    return ''
  }

  private async runLoop(rows: QueueRow[]) {
    const errors: ReviewImageImportStatus['errors'] = []
    let imported = 0
    let skipped = 0
    let failed = 0
    let processed = 0
    let startedAt = (await this.getStatus()).startedAt

    const snapshot = (
      status: ReviewImageImportStatus['status'],
      extra?: Partial<ReviewImageImportStatus>,
    ): ReviewImageImportStatus => ({
      status,
      total: rows.length,
      processed,
      imported,
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
      const template = presta.reviewImageUrlTemplate

      for (const row of rows) {
        if (this.cancelRequested) {
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

        const review = await this.prisma.review.findUnique({
          where: {
            legacySource_legacyId: { legacySource: 'prestashop', legacyId: row.commentLegacyId },
          },
        })
        if (!review) {
          failed++
          this.pushError(errors, row.imageLegacyId, `Відгук ${row.commentLegacyId} не знайдено`)
          continue
        }
        if (review.images.length >= MAX_REVIEW_IMAGES) {
          skipped++
          continue
        }

        const remoteUrl = template
          .replaceAll('{id_comment}', row.commentLegacyId)
          .replaceAll('{id_image}', row.imageLegacyId)

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
          const id = randomUUID()
          const webp = await sharp(buffer)
            .rotate()
            .resize({ width: 1200, withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer()
          const imageUrl = await this.catalogMedia.putReviewWebp(id, webp)

          await this.prisma.review.update({
            where: { id: review.id },
            data: { images: { push: imageUrl } },
          })
          imported++
          this.logger.debug(`Review image ${row.imageLegacyId} ← ${remoteUrl}`)
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
      this.pushError(errors, 'job', err instanceof Error ? err.message : 'Невідома помилка')
      await this.saveStatus(
        snapshot('error', {
          finishedAt: new Date().toISOString(),
        }),
      )
    } finally {
      this.running = false
      this.cancelRequested = false
    }
  }

  private pushError(errors: ReviewImageImportStatus['errors'], sourceId: string, error: string) {
    errors.push({ sourceId, error })
  }

  private async saveStatus(status: ReviewImageImportStatus) {
    await this.prisma.settings.upsert({
      where: { key: STATUS_KEY },
      create: { key: STATUS_KEY, value: JSON.stringify(status) },
      update: { value: JSON.stringify(status) },
    })
  }

  private safeParse(raw: string): unknown {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  private normalizeStatus(raw: unknown): ReviewImageImportStatus {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATUS }
    const value = raw as Partial<ReviewImageImportStatus>
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
