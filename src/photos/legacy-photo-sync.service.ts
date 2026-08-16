import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PhotoIdentifierType } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import { PhotoIndexService } from './photo-index.service'
import { PhotosService } from './photos.service'

const LEGACY_SYNC_STATUS_KEY = 'feature.legacyPhotoSyncStatus'

export type LegacyPhotoSyncStatus = {
  status: 'idle' | 'running' | 'completed' | 'error' | 'cancelled'
  manifestUrl: string | null
  total: number
  imported: number
  skipped: number
  startedAt: string | null
  finishedAt: string | null
  cancelRequested: boolean
  errors: Array<{ sourceId: string; error: string }>
}

type LegacyManifestItem = {
  id: string
  url: string
  appProperties: Record<string, string>
}

const DEFAULT_STATUS: LegacyPhotoSyncStatus = {
  status: 'idle',
  manifestUrl: null,
  total: 0,
  imported: 0,
  skipped: 0,
  startedAt: null,
  finishedAt: null,
  cancelRequested: false,
  errors: [],
}

function normalizeStatus(raw: unknown): LegacyPhotoSyncStatus {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATUS }
  const value = raw as Partial<LegacyPhotoSyncStatus>
  return {
    status:
      value.status === 'running' ||
      value.status === 'completed' ||
      value.status === 'error' ||
      value.status === 'cancelled' ||
      value.status === 'idle'
        ? value.status
        : 'idle',
    manifestUrl: typeof value.manifestUrl === 'string' ? value.manifestUrl : null,
    total: typeof value.total === 'number' ? value.total : 0,
    imported: typeof value.imported === 'number' ? value.imported : 0,
    skipped: typeof value.skipped === 'number' ? value.skipped : 0,
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : null,
    finishedAt: typeof value.finishedAt === 'string' ? value.finishedAt : null,
    cancelRequested: Boolean(value.cancelRequested),
    errors: Array.isArray(value.errors)
      ? value.errors
          .map((item) => {
            if (!item || typeof item !== 'object') return null
            const row = item as { sourceId?: string; fileId?: string; error?: string }
            const sourceId = row.sourceId?.trim() || row.fileId?.trim() || ''
            const error = row.error?.trim() || ''
            if (!sourceId) return null
            return { sourceId, error }
          })
          .filter((item): item is { sourceId: string; error: string } => Boolean(item))
      : [],
  }
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') out[key] = raw
    else if (raw != null) out[key] = String(raw)
  }
  return out
}

function resolveMimeType(contentType: string | null, url: string): 'image/jpeg' | 'image/webp' {
  const normalized = (contentType || '').split(';')[0].trim().toLowerCase()
  if (normalized === 'image/webp') return 'image/webp'
  if (normalized === 'image/jpeg' || normalized === 'image/jpg' || normalized === 'image/png') {
    return 'image/jpeg'
  }
  if (url.toLowerCase().includes('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const withCause = error as Error & { cause?: unknown }
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: withCause.cause != null ? String(withCause.cause) : undefined,
    }
  }
  return { value: String(error) }
}

function responseHeadersRecord(response: Response): Record<string, string> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  return headers
}

@Injectable()
export class LegacyPhotoSyncService {
  private readonly logger = new Logger(LegacyPhotoSyncService.name)
  private running = false
  private cancelRequested = false

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly photos: PhotosService,
    private readonly photoIndex: PhotoIndexService,
  ) {}

  async getStatus(): Promise<LegacyPhotoSyncStatus> {
    const row = await this.prisma.settings.findUnique({ where: { key: LEGACY_SYNC_STATUS_KEY } })
    if (!row?.value) return { ...DEFAULT_STATUS }
    try {
      return normalizeStatus(JSON.parse(row.value))
    } catch {
      return { ...DEFAULT_STATUS }
    }
  }

  private async saveStatus(status: LegacyPhotoSyncStatus): Promise<void> {
    await this.prisma.settings.upsert({
      where: { key: LEGACY_SYNC_STATUS_KEY },
      create: { key: LEGACY_SYNC_STATUS_KEY, value: JSON.stringify(status) },
      update: { value: JSON.stringify(status) },
    })
  }

  private logSyncFailure(context: string, details: Record<string, unknown>): void {
    this.logger.error(`${context}\n${JSON.stringify(details, null, 2)}`)
  }

  private resolveManifestUrl(input?: string): string {
    const value = input?.trim()
    if (!value) {
      throw new BadRequestException('Вкажіть URL маніфесту (…/photos/list-all)')
    }
    try {
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new BadRequestException('URL маніфесту має починатися з http:// або https://')
      }
      return url.toString()
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      throw new BadRequestException('Некоректний URL маніфесту')
    }
  }

  private resolveApiKey(bodyKey?: string): string {
    const key = bodyKey?.trim() || this.config.get<string>('LEGACY_PHOTO_API_KEY')?.trim() || ''
    if (!key) {
      throw new BadRequestException(
        'Вкажіть API-ключ (у формі або LEGACY_PHOTO_API_KEY у .env бекенду)',
      )
    }
    return key
  }

  private async fetchManifest(manifestUrl: string, apiKey: string): Promise<LegacyManifestItem[]> {
    let response: Response
    try {
      response = await fetch(manifestUrl, {
        headers: {
          'x-api-key': apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(120_000),
      })
    } catch (error) {
      this.logSyncFailure('Legacy sync manifest request failed', {
        manifestUrl,
        error: serializeError(error),
      })
      throw error
    }

    const rawText = await response.text().catch(() => '')

    if (!response.ok) {
      this.logSyncFailure('Legacy sync manifest HTTP error', {
        manifestUrl,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeadersRecord(response),
        body: rawText,
      })
      throw new BadRequestException(
        `Не вдалося отримати маніфест: HTTP ${response.status}${rawText ? ` — ${rawText.slice(0, 200)}` : ''}`,
      )
    }

    let payload: unknown
    try {
      payload = rawText ? JSON.parse(rawText) : null
    } catch (error) {
      this.logSyncFailure('Legacy sync manifest JSON parse error', {
        manifestUrl,
        status: response.status,
        headers: responseHeadersRecord(response),
        body: rawText,
        error: serializeError(error),
      })
      throw new BadRequestException('Маніфест містить некоректний JSON')
    }

    if (!Array.isArray(payload)) {
      this.logSyncFailure('Legacy sync manifest invalid payload', {
        manifestUrl,
        status: response.status,
        body: rawText,
        parsedType: payload === null ? 'null' : typeof payload,
      })
      throw new BadRequestException('Маніфест має бути JSON-масивом')
    }

    const items: LegacyManifestItem[] = []
    for (const entry of payload) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as { id?: unknown; url?: unknown; appProperties?: unknown }
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      const url = typeof row.url === 'string' ? row.url.trim() : ''
      if (!id || !url) continue
      items.push({
        id,
        url,
        appProperties: asStringRecord(row.appProperties),
      })
    }

    if (items.length === 0) {
      this.logSyncFailure('Legacy sync manifest has no valid photos', {
        manifestUrl,
        status: response.status,
        body: rawText,
        totalEntries: payload.length,
      })
      throw new BadRequestException('Маніфест не містить жодного валідного фото')
    }

    return items
  }

  private async downloadPhoto(
    url: string,
    sourceId: string,
  ): Promise<{ buffer: Buffer; mimeType: 'image/jpeg' | 'image/webp' }> {
    let lastError: Error | null = null
    let lastFailureDetails: Record<string, unknown> | null = null

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url, {
          redirect: 'follow',
          signal: AbortSignal.timeout(90_000),
        })

        const contentType = response.headers.get('content-type')

        if (!response.ok) {
          const rawText = await response.text().catch(() => '')
          const details = {
            sourceId,
            url,
            attempt: attempt + 1,
            status: response.status,
            statusText: response.statusText,
            headers: responseHeadersRecord(response),
            contentType,
            body: rawText,
          }
          lastFailureDetails = details
          throw new Error(`HTTP ${response.status}${rawText ? `: ${rawText}` : ''}`)
        }

        const mimeType = resolveMimeType(contentType, url)
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        if (buffer.byteLength < 512) {
          const preview = buffer.toString('utf8', 0, Math.min(buffer.byteLength, 2000))
          const details = {
            sourceId,
            url,
            attempt: attempt + 1,
            status: response.status,
            contentType,
            byteLength: buffer.byteLength,
            bodyPreview: preview,
          }
          lastFailureDetails = details
          throw new Error('Занадто малий файл')
        }

        return { buffer, mimeType }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 400))
        }
      }
    }

    this.logSyncFailure('Legacy sync photo download failed', {
      sourceId,
      url,
      error: serializeError(lastError),
      response: lastFailureDetails,
    })

    throw lastError ?? new Error('Не вдалося завантажити фото')
  }

  async startSync(params: { manifestUrl?: string; apiKey?: string }): Promise<LegacyPhotoSyncStatus> {
    const current = await this.getStatus()
    if (current.status === 'running' || this.running) {
      throw new ConflictException('Синхронізація уже виконується')
    }

    const manifestUrl = this.resolveManifestUrl(params.manifestUrl)
    const apiKey = this.resolveApiKey(params.apiKey)
    const manifest = await this.fetchManifest(manifestUrl, apiKey)

    const startedAt = new Date().toISOString()
    this.cancelRequested = false

    const initialStatus: LegacyPhotoSyncStatus = {
      status: 'running',
      manifestUrl,
      total: manifest.length,
      imported: 0,
      skipped: 0,
      startedAt,
      finishedAt: null,
      cancelRequested: false,
      errors: [],
    }
    await this.saveStatus(initialStatus)

    void this.runSync(manifest, manifestUrl, startedAt).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error)
      this.logSyncFailure('Legacy photo sync failed', {
        manifestUrl,
        error: serializeError(error),
      })
      await this.saveStatus({
        ...initialStatus,
        status: 'error',
        finishedAt: new Date().toISOString(),
        cancelRequested: this.cancelRequested,
        errors: [{ sourceId: manifestUrl, error: message }],
      })
      this.running = false
      this.cancelRequested = false
    })

    return initialStatus
  }

  async cancelSync(): Promise<LegacyPhotoSyncStatus> {
    const current = await this.getStatus()
    if (current.status !== 'running') {
      return current
    }

    this.cancelRequested = true
    const next: LegacyPhotoSyncStatus = {
      ...current,
      cancelRequested: true,
    }
    await this.saveStatus(next)
    return next
  }

  private shouldCancel(): boolean {
    return this.cancelRequested
  }

  private async runSync(
    manifest: LegacyManifestItem[],
    manifestUrl: string,
    startedAt: string,
  ): Promise<void> {
    this.running = true
    let imported = 0
    let skipped = 0
    const errors: Array<{ sourceId: string; error: string }> = []
    const existingSourceIds = await this.photoIndex.getImportedLegacySourceIds()

    for (const item of manifest) {
      if (this.shouldCancel()) {
        await this.saveStatus({
          status: 'cancelled',
          manifestUrl,
          total: manifest.length,
          imported,
          skipped,
          startedAt,
          finishedAt: new Date().toISOString(),
          cancelRequested: true,
          errors,
        })
        this.running = false
        this.cancelRequested = false
        return
      }

      if (existingSourceIds.has(item.id)) {
        skipped += 1
        await this.saveStatus({
          status: 'running',
          manifestUrl,
          total: manifest.length,
          imported,
          skipped,
          startedAt,
          finishedAt: null,
          cancelRequested: this.cancelRequested,
          errors,
        })
        continue
      }

      try {
        const { buffer } = await this.downloadPhoto(item.url, item.id)

        if (this.shouldCancel()) {
          await this.saveStatus({
            status: 'cancelled',
            manifestUrl,
            total: manifest.length,
            imported,
            skipped,
            startedAt,
            finishedAt: new Date().toISOString(),
            cancelRequested: true,
            errors,
          })
          this.running = false
          this.cancelRequested = false
          return
        }

        const appProperties: Record<string, string> = {
          ...item.appProperties,
          legacyGoogleId: item.id,
        }
        const ean = (appProperties.barcode || '').trim() || 'imported'

        await this.photos.persistProcessedPhoto({
          buffer,
          identifierType: PhotoIdentifierType.EAN,
          identifier: ean,
          appProperties,
          watermark: false,
        })

        existingSourceIds.add(item.id)
        imported += 1
      } catch (error) {
        skipped += 1
        const message = error instanceof Error ? error.message : String(error)
        this.logSyncFailure('Legacy sync item failed', {
          sourceId: item.id,
          url: item.url,
          appProperties: item.appProperties,
          error: serializeError(error),
        })
        errors.push({ sourceId: item.id, error: message })
      }

      await this.saveStatus({
        status: 'running',
        manifestUrl,
        total: manifest.length,
        imported,
        skipped,
        startedAt,
        finishedAt: null,
        cancelRequested: this.cancelRequested,
        errors,
      })
    }

    if (errors.length > 0) {
      this.logSyncFailure('Legacy photo sync completed with item errors', {
        manifestUrl,
        total: manifest.length,
        imported,
        skipped,
        errors,
      })
    }

    await this.saveStatus({
      status: 'completed',
      manifestUrl,
      total: manifest.length,
      imported,
      skipped,
      startedAt,
      finishedAt: new Date().toISOString(),
      cancelRequested: false,
      errors,
    })
    this.running = false
    this.cancelRequested = false
  }
}
