import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { google, drive_v3 } from 'googleapis'
import { Readable } from 'stream'

import { PrismaService } from '../prisma/prisma.service'
import { PhotoIndexService } from './photo-index.service'
import { PhotoStorageService } from './photo-storage.service'
import { WatermarkService } from './watermark.service'

const DRIVE_IMPORT_STATUS_KEY = 'feature.drivePhotoImportStatus'

export type DriveImportStatus = {
  status: 'idle' | 'running' | 'completed' | 'error' | 'cancelled'
  folderId: string | null
  total: number
  imported: number
  skipped: number
  startedAt: string | null
  finishedAt: string | null
  cancelRequested: boolean
  errors: Array<{ fileId: string; error: string }>
}

const DEFAULT_STATUS: DriveImportStatus = {
  status: 'idle',
  folderId: null,
  total: 0,
  imported: 0,
  skipped: 0,
  startedAt: null,
  finishedAt: null,
  cancelRequested: false,
  errors: [],
}

function extractFolderId(input?: string): string | null {
  if (!input?.trim()) return null
  const value = input.trim()
  if (/^[a-zA-Z0-9_-]+$/.test(value)) return value
  const match = value.match(/\/folders\/([a-zA-Z0-9_-]+)/) || value.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  return match?.[1] ?? null
}

function propsFromDrive(file: drive_v3.Schema$File): Record<string, string> {
  const props = { ...(file.appProperties ?? {}) } as Record<string, string>
  if (!props.plantName && file.name) props.plantName = file.name.replace(/\.[^.]+$/, '')
  if (!props.date && file.createdTime) props.date = file.createdTime
  if (!props.barcode) props.barcode = props.barcode || 'imported'
  if (!props.plantSize) props.plantSize = props.plantSize || '—'
  if (!props.sizeId) props.sizeId = props.sizeId || props.barcode || file.id || 'imported'
  if (!props.productId) props.productId = props.productId || ''
  if (!props.storageName) props.storageName = props.storageName || ''
  if (!props.viberSent) props.viberSent = '0'
  return props
}

function normalizeStatus(raw: unknown): DriveImportStatus {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATUS }
  const value = raw as Partial<DriveImportStatus>
  return {
    status:
      value.status === 'running' ||
      value.status === 'completed' ||
      value.status === 'error' ||
      value.status === 'cancelled' ||
      value.status === 'idle'
        ? value.status
        : 'idle',
    folderId: typeof value.folderId === 'string' ? value.folderId : null,
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
            const fileId = typeof item.fileId === 'string' ? item.fileId : ''
            const error = typeof item.error === 'string' ? item.error : ''
            if (!fileId) return null
            return { fileId, error }
          })
          .filter((item): item is { fileId: string; error: string } => Boolean(item))
      : [],
  }
}

@Injectable()
export class DriveImportService {
  private readonly logger = new Logger(DriveImportService.name)
  private running = false

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: PhotoStorageService,
    private readonly photoIndex: PhotoIndexService,
    private readonly watermark: WatermarkService,
  ) {}

  async getStatus(): Promise<DriveImportStatus> {
    const row = await this.prisma.settings.findUnique({ where: { key: DRIVE_IMPORT_STATUS_KEY } })
    if (!row?.value) return { ...DEFAULT_STATUS }
    try {
      return normalizeStatus(JSON.parse(row.value))
    } catch {
      return { ...DEFAULT_STATUS }
    }
  }

  private async saveStatus(status: DriveImportStatus): Promise<void> {
    await this.prisma.settings.upsert({
      where: { key: DRIVE_IMPORT_STATUS_KEY },
      create: { key: DRIVE_IMPORT_STATUS_KEY, value: JSON.stringify(status) },
      update: { value: JSON.stringify(status) },
    })
  }

  private createDrive(): drive_v3.Drive {
    const credentialsBase64 = this.config.get<string>('GOOGLE_CREDENTIALS')
    if (!credentialsBase64) {
      throw new BadRequestException('GOOGLE_CREDENTIALS не налаштовано')
    }
    const credentials = JSON.parse(Buffer.from(credentialsBase64, 'base64').toString('utf-8'))
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    })
    return google.drive({ version: 'v3', auth })
  }

  private async downloadFile(drive: drive_v3.Drive, fileId: string): Promise<Buffer> {
    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
    const stream = res.data as Readable
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  private resolveFolderId(params: { folderId?: string; folderUrl?: string }): string {
    const folderId =
      extractFolderId(params.folderId) ||
      extractFolderId(params.folderUrl) ||
      this.config.get<string>('GOOGLE_DRIVE_FOLDER_ID')?.trim() ||
      null

    if (!folderId) {
      throw new BadRequestException('Вкажіть folderId або folderUrl Google Drive')
    }
    return folderId
  }

  async startImport(params: { folderId?: string; folderUrl?: string }): Promise<DriveImportStatus> {
    const current = await this.getStatus()
    if (current.status === 'running' || this.running) {
      throw new ConflictException('Імпорт уже виконується')
    }

    const folderId = this.resolveFolderId(params)
    const drive = this.createDrive()
    const listed = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and (mimeType = 'image/jpeg' or mimeType = 'image/webp' or mimeType = 'image/png')`,
      fields: 'files(id, name, mimeType, appProperties, createdTime)',
      pageSize: 200,
    })

    const files = listed.data.files ?? []
    const startedAt = new Date().toISOString()
    const initialStatus: DriveImportStatus = {
      status: 'running',
      folderId,
      total: files.length,
      imported: 0,
      skipped: 0,
      startedAt,
      finishedAt: null,
      cancelRequested: false,
      errors: [],
    }
    await this.saveStatus(initialStatus)

    void this.runImport(drive, files, folderId).catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('Drive import failed', error)
      await this.saveStatus({
        ...initialStatus,
        status: 'error',
        finishedAt: new Date().toISOString(),
        errors: [{ fileId: folderId, error: message }],
      })
      this.running = false
    })

    return initialStatus
  }

  async cancelImport(): Promise<DriveImportStatus> {
    const current = await this.getStatus()
    if (current.status !== 'running') {
      return current
    }
    const next: DriveImportStatus = {
      ...current,
      cancelRequested: true,
    }
    await this.saveStatus(next)
    return next
  }

  private async isCancelRequested(): Promise<boolean> {
    const current = await this.getStatus()
    return current.cancelRequested
  }

  private async runImport(
    drive: drive_v3.Drive,
    files: drive_v3.Schema$File[],
    folderId: string,
  ): Promise<void> {
    this.running = true
    let imported = 0
    let skipped = 0
    const errors: Array<{ fileId: string; error: string }> = []
    const startedAt = new Date().toISOString()

    for (const file of files) {
      if (!file.id) continue

      if (await this.isCancelRequested()) {
        await this.saveStatus({
          status: 'cancelled',
          folderId,
          total: files.length,
          imported,
          skipped,
          startedAt,
          finishedAt: new Date().toISOString(),
          cancelRequested: true,
          errors,
        })
        this.running = false
        return
      }

      try {
        const buffer = await this.downloadFile(drive, file.id)
        const mimeType =
          file.mimeType === 'image/webp'
            ? 'image/webp'
            : file.mimeType === 'image/png'
              ? 'image/jpeg'
              : 'image/jpeg'
        const watermarked =
          mimeType === 'image/jpeg' || mimeType === 'image/webp'
            ? await this.watermark.addWatermark(buffer, mimeType)
            : buffer

        const appProperties = propsFromDrive(file)
        const ean = (appProperties.barcode || '').trim() || 'imported'
        const saved = await this.storage.savePhoto({
          buffer: watermarked,
          mimeType,
          barcode: ean,
          plantName: appProperties.plantName || file.name || 'photo',
          plantSize: appProperties.plantSize || '—',
        })

        await this.photoIndex.addPhoto({
          ean,
          fileId: saved.fileId,
          buffer: watermarked,
          url: saved.url,
          relativePath: saved.relativePath,
          fileSizeBytes: saved.fileSizeBytes,
          appProperties: {
            ...appProperties,
            importedFromDriveId: file.id,
          },
        })
        imported += 1
      } catch (error) {
        skipped += 1
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error(`Drive import failed for ${file.id}`, error)
        errors.push({ fileId: file.id, error: message })
      }

      await this.saveStatus({
        status: 'running',
        folderId,
        total: files.length,
        imported,
        skipped,
        startedAt,
        finishedAt: null,
        cancelRequested: false,
        errors,
      })
    }

    await this.saveStatus({
      status: 'completed',
      folderId,
      total: files.length,
      imported,
      skipped,
      startedAt,
      finishedAt: new Date().toISOString(),
      cancelRequested: false,
      errors,
    })
    this.running = false
  }

  /** @deprecated Use startImport + getStatus for progress tracking */
  async importFromFolder(params: { folderId?: string; folderUrl?: string }) {
    const status = await this.startImport(params)
    while (true) {
      const current = await this.getStatus()
      if (current.status !== 'running') {
        return {
          folderId: current.folderId ?? status.folderId,
          total: current.total,
          imported: current.imported,
          skipped: current.skipped,
          errors: current.errors,
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}
