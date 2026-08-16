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

const STATUS_KEY = 'feature.prestaBlogImageImportStatus'

export type BlogImageImportStatus = {
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
  blogLegacyId: string
  imageLegacyId: string
  position: number
  type: string
}

const DEFAULT_STATUS: BlogImageImportStatus = {
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
export class BlogImageImportService {
  private readonly logger = new Logger(BlogImageImportService.name)
  private running = false
  private cancelRequested = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly catalogMedia: CatalogMediaService,
  ) {}

  async getStatus(): Promise<BlogImageImportStatus> {
    const row = await this.prisma.settings.findUnique({ where: { key: STATUS_KEY } })
    return this.normalizeStatus(row?.value ? this.safeParse(row.value) : null)
  }

  async cancel(): Promise<BlogImageImportStatus> {
    const current = await this.getStatus()
    if (current.status !== 'running') return current
    this.cancelRequested = true
    const next = { ...current, cancelRequested: true }
    await this.saveStatus(next)
    return next
  }

  async start(csvBuffer: Buffer): Promise<BlogImageImportStatus> {
    if (this.running) {
      throw new ConflictException('Імпорт обкладинок блогу вже виконується.')
    }

    const content = csvBuffer.toString('utf-8').replace(/^\uFEFF/, '')
    const parsed = parseDelimitedCsv(content, ';')
      .map((r) => {
        const blogLegacyId = r.blog_legacy_id?.trim()
        const imageLegacyId = r.image_legacy_id?.trim()
        if (!blogLegacyId || !imageLegacyId) return null
        return {
          blogLegacyId,
          imageLegacyId,
          position: Number(r.position || 0) || 0,
          type: r.type?.trim() || '',
        } satisfies QueueRow
      })
      .filter((r): r is QueueRow => r != null)

    const bestByBlog = new Map<string, QueueRow>()
    for (const row of parsed) {
      const prev = bestByBlog.get(row.blogLegacyId)
      if (!prev) {
        bestByBlog.set(row.blogLegacyId, row)
        continue
      }
      const prevCover = prev.type === '1'
      const nextCover = row.type === '1'
      if (nextCover && !prevCover) bestByBlog.set(row.blogLegacyId, row)
      else if (nextCover === prevCover && row.position < prev.position) {
        bestByBlog.set(row.blogLegacyId, row)
      }
    }

    const rows = [...bestByBlog.values()]
    if (rows.length === 0) {
      throw new BadRequestException('CSV обкладинок блогу порожній.')
    }

    const initial: BlogImageImportStatus = {
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

  private async runLoop(rows: QueueRow[]) {
    const errors: BlogImageImportStatus['errors'] = []
    let imported = 0
    let skipped = 0
    let failed = 0
    let processed = 0
    let startedAt = (await this.getStatus()).startedAt

    const snapshot = (
      status: BlogImageImportStatus['status'],
      extra?: Partial<BlogImageImportStatus>,
    ): BlogImageImportStatus => ({
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
      const template = presta.blogImageUrlTemplate

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

        const post = await this.prisma.blogPost.findUnique({
          where: { legacyId: row.blogLegacyId },
        })
        if (!post) {
          failed++
          this.pushError(errors, row.imageLegacyId, `Пост ${row.blogLegacyId} не знайдено`)
          continue
        }
        if (post.image) {
          skipped++
          continue
        }

        const remoteCandidates = this.buildBlogImageUrls(
          template,
          row.blogLegacyId,
          row.imageLegacyId,
        )

        try {
          let buffer: Buffer | null = null
          let usedUrl = ''
          let lastStatus = 0
          for (const remoteUrl of remoteCandidates) {
            const imgRes = await fetch(remoteUrl, {
              headers: { 'User-Agent': 'GreenAngelsImport/1.0' },
              signal: AbortSignal.timeout(45_000),
            })
            if (!imgRes.ok) {
              lastStatus = imgRes.status
              continue
            }
            buffer = Buffer.from(await imgRes.arrayBuffer())
            usedUrl = remoteUrl
            break
          }

          if (!buffer) {
            failed++
            this.pushError(
              errors,
              row.imageLegacyId,
              `HTTP ${lastStatus || 404}: ${remoteCandidates[0] || 'no-url'}`,
            )
            continue
          }

          const id = randomUUID()
          const cover = await sharp(buffer)
            .rotate()
            .resize({ width: 960, withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer()
          const imageUrl = await this.catalogMedia.putBlogCover(id, cover)
          await this.prisma.blogPost.update({
            where: { id: post.id },
            data: { image: imageUrl },
          })
          imported++
          this.logger.debug(`Blog cover ${row.imageLegacyId} ← ${usedUrl}`)
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

  private buildBlogImageUrls(
    template: string,
    blogLegacyId: string,
    imageLegacyId: string,
  ): string[] {
    const fill = (tpl: string) =>
      tpl
        .replaceAll('{id_blog}', blogLegacyId)
        .replaceAll('{id_image}', imageLegacyId)
        .replaceAll('{id}', imageLegacyId)

    const primary = fill(template)
    const candidates = [primary]
    const base =
      `https://landshaft.info/upload/stblog/1/${blogLegacyId}/${imageLegacyId}/` +
      `${blogLegacyId}${imageLegacyId}`
    for (const suffix of ['medium.jpg', 'large.jpg', 'small.jpg', 'thumb.jpg', '.jpg']) {
      const url = suffix === '.jpg' ? `${base}.jpg` : `${base}${suffix}`
      if (!candidates.includes(url)) candidates.push(url)
    }
    return candidates
  }

  private pushError(errors: BlogImageImportStatus['errors'], sourceId: string, error: string) {
    errors.push({ sourceId, error })
  }

  private async saveStatus(status: BlogImageImportStatus) {
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

  private normalizeStatus(raw: unknown): BlogImageImportStatus {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATUS }
    const value = raw as Partial<BlogImageImportStatus>
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
