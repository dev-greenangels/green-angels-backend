import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

import { resolveMediaDriver } from './media-driver'
import {
  diskRelativeToKey,
  estimateRelativeToKey,
  isPrivateObjectKey,
  normalizePosix,
  privateKeyToLocalRelative,
  publicPathToKey,
} from './media-keys'
import {
  getEstimatePhotosRoot,
  getPrivateStorageRoot,
  getUploadRoot,
} from './storage.config'

export type MediaObjectMeta = {
  key: string
  size: number
}

@Injectable()
export class MediaStorageService implements OnModuleInit {
  private readonly logger = new Logger(MediaStorageService.name)
  private s3Public: S3Client | null = null
  private s3Private: S3Client | null = null
  private publicBucket = ''
  private privateBucket = ''
  private driver: 'local' | 'r2' = 'local'
  private keepLocal = false
  private uploadRoot = ''
  private estimateRoot = ''
  private privateRoot = ''

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.uploadRoot = getUploadRoot(this.config)
    this.estimateRoot = getEstimatePhotosRoot(this.config)
    this.privateRoot = getPrivateStorageRoot(this.config)
    const resolved = resolveMediaDriver({
      nodeEnv: this.config.get<string>('NODE_ENV'),
      mediaDriver: this.config.get<string>('MEDIA_DRIVER'),
      keepLocal: this.config.get<string>('MEDIA_KEEP_LOCAL'),
    })
    this.driver = resolved.driver
    this.keepLocal = resolved.keepLocal
    if (this.driver === 'r2') {
      this.s3Public = this.createPublicS3Client()
      // Private client is required in r2 mode so OrderDocument never falls back to public bucket.
      this.s3Private = this.createPrivateS3Client()
    }
  }

  getDriver(): 'local' | 'r2' {
    return this.driver
  }

  isR2Enabled(): boolean {
    return this.driver === 'r2'
  }

  isPrivateR2Configured(): boolean {
    if (this.driver === 'local') return true
    return Boolean(this.s3Private && this.privateBucket)
  }

  private createPublicS3Client(): S3Client {
    const endpoint = this.config.get<string>('R2_ENDPOINT')?.trim()
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID')?.trim()
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY')?.trim()
    const bucket = this.config.get<string>('R2_BUCKET')?.trim()
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error(
        'MEDIA_DRIVER=r2 requires R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.',
      )
    }
    this.publicBucket = bucket
    const region = this.config.get<string>('R2_REGION')?.trim() || 'auto'
    return new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    })
  }

  private createPrivateS3Client(): S3Client {
    const endpoint = this.config.get<string>('R2_ENDPOINT')?.trim()
    const accessKeyId = this.config.get<string>('R2_PRIVATE_ACCESS_KEY_ID')?.trim()
    const secretAccessKey = this.config.get<string>('R2_PRIVATE_SECRET_ACCESS_KEY')?.trim()
    const bucket = this.config.get<string>('R2_PRIVATE_BUCKET')?.trim()
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error(
        'MEDIA_DRIVER=r2 requires R2_PRIVATE_ACCESS_KEY_ID, R2_PRIVATE_SECRET_ACCESS_KEY, R2_PRIVATE_BUCKET (separate private document bucket).',
      )
    }
    this.privateBucket = bucket
    const region = this.config.get<string>('R2_REGION')?.trim() || 'auto'
    return new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    })
  }

  publicPathToKey(publicPath: string): string {
    return publicPathToKey(publicPath)
  }

  keyToLocalPath(key: string): string {
    const normalized = normalizePosix(key)
    if (isPrivateObjectKey(normalized)) {
      return join(this.privateRoot, privateKeyToLocalRelative(normalized))
    }
    if (normalized.startsWith('uploads/estimate-photos/')) {
      return join(this.estimateRoot, normalized.slice('uploads/estimate-photos/'.length))
    }
    if (normalized.startsWith('uploads/')) {
      return join(this.uploadRoot, normalized.slice('uploads/'.length))
    }
    throw new Error(`Некоректний media key: ${key}`)
  }

  estimateKey(relativePath: string): string {
    return estimateRelativeToKey(relativePath)
  }

  diskRelativeKey(diskRelative: string): string {
    return diskRelativeToKey(diskRelative)
  }

  async putObject(params: {
    key: string
    body: Buffer
    contentType: string
  }): Promise<void> {
    const key = normalizePosix(params.key)
    if (isPrivateObjectKey(key)) {
      throw new Error('Використовуйте putPrivateObject для приватних документів замовлення.')
    }
    if (this.driver === 'r2') {
      await this.r2PutPublic(key, params.body, params.contentType)
      if (this.keepLocal) {
        await this.localPut(key, params.body)
      }
      return
    }
    await this.localPut(key, params.body)
  }

  /**
   * Order PDFs / PII documents — private bucket only when driver=r2.
   * NEVER falls back to the public media bucket.
   */
  async putPrivateObject(params: {
    key: string
    body: Buffer
    contentType: string
  }): Promise<void> {
    const key = normalizePosix(params.key)
    if (!isPrivateObjectKey(key)) {
      throw new Error(
        `putPrivateObject вимагає ключ orders/… або legacy private/… (отримали: ${key})`,
      )
    }
    if (this.driver === 'r2') {
      await this.r2PutPrivate(key, params.body, params.contentType)
      if (this.keepLocal) {
        await this.localPut(key, params.body)
      }
      return
    }
    await this.localPut(key, params.body)
  }

  /** Read private OrderDocument bytes. Never uses the public media bucket. */
  async getPrivateObject(key: string): Promise<Buffer> {
    const normalized = normalizePosix(key)
    if (!isPrivateObjectKey(normalized)) {
      throw new Error(`getPrivateObject вимагає приватний ключ (отримали: ${key})`)
    }
    if (this.driver === 'r2') {
      const result = await this.requirePrivateS3().send(
        new GetObjectCommand({ Bucket: this.privateBucket, Key: normalized }),
      )
      const bytes = await result.Body?.transformToByteArray()
      if (!bytes) {
        throw new Error(`Порожній приватний об'єкт R2: ${normalized}`)
      }
      return Buffer.from(bytes)
    }
    return readFile(this.keyToLocalPath(normalized))
  }

  async deletePrivateObject(key: string): Promise<void> {
    const normalized = normalizePosix(key)
    if (!isPrivateObjectKey(normalized)) {
      throw new Error(`deletePrivateObject вимагає приватний ключ (отримали: ${key})`)
    }
    if (this.driver === 'r2') {
      await this.requirePrivateS3().send(
        new DeleteObjectCommand({ Bucket: this.privateBucket, Key: normalized }),
      )
      if (this.keepLocal) {
        await this.localDelete(normalized)
      }
      return
    }
    await this.localDelete(normalized)
  }

  /** Public media get (uploads/…). Private keys must use getPrivateObject. */
  async getObject(key: string): Promise<Buffer> {
    const normalized = normalizePosix(key)
    if (isPrivateObjectKey(normalized)) {
      return this.getPrivateObject(normalized)
    }
    if (this.driver === 'r2') {
      const result = await this.requirePublicS3().send(
        new GetObjectCommand({ Bucket: this.publicBucket, Key: normalized }),
      )
      const bytes = await result.Body?.transformToByteArray()
      if (!bytes) {
        throw new Error(`Порожній об'єкт R2: ${normalized}`)
      }
      return Buffer.from(bytes)
    }
    return readFile(this.keyToLocalPath(normalized))
  }

  async deleteObject(key: string): Promise<void> {
    const normalized = normalizePosix(key)
    if (isPrivateObjectKey(normalized)) {
      await this.deletePrivateObject(normalized)
      return
    }
    if (this.driver === 'r2') {
      await this.requirePublicS3().send(
        new DeleteObjectCommand({ Bucket: this.publicBucket, Key: normalized }),
      )
      if (this.keepLocal) {
        await this.localDelete(normalized)
      }
      return
    }
    await this.localDelete(normalized)
  }

  async deletePrefix(prefix: string): Promise<void> {
    const normalized = normalizePosix(prefix).replace(/\/?$/, '/')
    if (isPrivateObjectKey(normalized)) {
      throw new Error('deletePrefix не підтримує приватні ключі — використовуйте deletePrivateObject.')
    }
    if (this.driver === 'r2') {
      const keys = await this.listPublicKeys(normalized)
      for (const key of keys) {
        await this.requirePublicS3().send(
          new DeleteObjectCommand({ Bucket: this.publicBucket, Key: key }),
        )
      }
      if (this.keepLocal) {
        await this.localDeletePrefix(normalized)
      }
      return
    }
    await this.localDeletePrefix(normalized)
  }

  async copyObject(fromKey: string, toKey: string): Promise<void> {
    const from = normalizePosix(fromKey)
    const to = normalizePosix(toKey)
    if (from === to) return
    if (isPrivateObjectKey(from) || isPrivateObjectKey(to)) {
      throw new Error('copyObject не підтримує приватні ключі.')
    }
    if (this.driver === 'r2') {
      await this.requirePublicS3().send(
        new CopyObjectCommand({
          Bucket: this.publicBucket,
          CopySource: `${this.publicBucket}/${from}`,
          Key: to,
        }),
      )
      if (this.keepLocal) {
        await this.localCopyFile(from, to)
      }
      return
    }
    await this.localCopyFile(from, to)
  }

  async copyPrefix(fromPrefix: string, toPrefix: string): Promise<void> {
    const from = normalizePosix(fromPrefix).replace(/\/?$/, '/')
    const to = normalizePosix(toPrefix).replace(/\/?$/, '/')
    if (isPrivateObjectKey(from) || isPrivateObjectKey(to)) {
      throw new Error('copyPrefix не підтримує приватні ключі.')
    }
    if (this.driver === 'r2') {
      const keys = await this.listPublicKeys(from)
      for (const key of keys) {
        const dest = `${to}${key.slice(from.length)}`
        await this.copyObject(key, dest)
      }
      if (this.keepLocal) {
        await this.localCopyPrefix(from, to)
      }
      return
    }
    await this.localCopyPrefix(from, to)
  }

  async headObject(key: string): Promise<MediaObjectMeta | null> {
    const normalized = normalizePosix(key)
    if (isPrivateObjectKey(normalized)) {
      if (this.driver === 'r2') {
        try {
          const head = await this.requirePrivateS3().send(
            new HeadObjectCommand({ Bucket: this.privateBucket, Key: normalized }),
          )
          return { key: normalized, size: head.ContentLength ?? 0 }
        } catch (error: unknown) {
          if (this.isNotFound(error)) return null
          throw error
        }
      }
    } else if (this.driver === 'r2') {
      try {
        const head = await this.requirePublicS3().send(
          new HeadObjectCommand({ Bucket: this.publicBucket, Key: normalized }),
        )
        return { key: normalized, size: head.ContentLength ?? 0 }
      } catch (error: unknown) {
        if (this.isNotFound(error)) return null
        throw error
      }
    }
    try {
      const { stat } = await import('fs/promises')
      const info = await stat(this.keyToLocalPath(normalized))
      if (!info.isFile()) return null
      return { key: normalized, size: info.size }
    } catch (error: unknown) {
      if (this.isEnoent(error)) return null
      throw error
    }
  }

  /** Test helper: private bucket name when r2 (empty when local). */
  getPrivateBucketNameForTests(): string {
    return this.privateBucket
  }

  getPublicBucketNameForTests(): string {
    return this.publicBucket
  }

  private async r2PutPublic(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.requirePublicS3().send(
      new PutObjectCommand({
        Bucket: this.publicBucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    )
  }

  private async r2PutPrivate(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.requirePrivateS3().send(
      new PutObjectCommand({
        Bucket: this.privateBucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'private, no-store',
      }),
    )
  }

  private async listPublicKeys(prefix: string): Promise<string[]> {
    const keys: string[] = []
    let token: string | undefined
    do {
      const page = await this.requirePublicS3().send(
        new ListObjectsV2Command({
          Bucket: this.publicBucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      )
      for (const item of page.Contents ?? []) {
        if (item.Key) keys.push(item.Key)
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    return keys
  }

  private async localPut(key: string, body: Buffer): Promise<void> {
    const absolute = this.keyToLocalPath(key)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, body)
  }

  private async localDelete(key: string): Promise<void> {
    try {
      await unlink(this.keyToLocalPath(key))
    } catch (error: unknown) {
      if (!this.isEnoent(error)) {
        this.logger.error(`Failed to delete local media ${key}`, error)
      }
    }
  }

  private async localDeletePrefix(prefix: string): Promise<void> {
    const { rm } = await import('fs/promises')
    const absolute = this.keyToLocalPath(prefix.replace(/\/$/, ''))
    try {
      await rm(absolute, { recursive: true, force: true })
    } catch (error: unknown) {
      if (!this.isEnoent(error)) {
        this.logger.error(`Failed to delete local prefix ${prefix}`, error)
      }
    }
  }

  private async localCopyFile(fromKey: string, toKey: string): Promise<void> {
    const { copyFile, mkdir: mk } = await import('fs/promises')
    const from = this.keyToLocalPath(fromKey)
    const to = this.keyToLocalPath(toKey)
    await mk(dirname(to), { recursive: true })
    await copyFile(from, to)
  }

  private async localCopyPrefix(fromPrefix: string, toPrefix: string): Promise<void> {
    const { readdir } = await import('fs/promises')
    const fromDir = this.keyToLocalPath(fromPrefix.replace(/\/$/, ''))
    let names: string[] = []
    try {
      names = await readdir(fromDir)
    } catch (error: unknown) {
      if (this.isEnoent(error)) return
      throw error
    }
    for (const name of names) {
      await this.localCopyFile(`${fromPrefix}${name}`, `${toPrefix}${name}`)
    }
  }

  private requirePublicS3(): S3Client {
    if (!this.s3Public) {
      throw new ServiceUnavailableException('Публічний R2 клієнт не ініціалізовано.')
    }
    return this.s3Public
  }

  private requirePrivateS3(): S3Client {
    if (!this.s3Private || !this.privateBucket) {
      throw new ServiceUnavailableException(
        'Приватне R2-сховище документів не налаштовано (R2_PRIVATE_*).',
      )
    }
    return this.s3Private
  }

  private isNotFound(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const name = 'name' in error ? String((error as { name?: string }).name) : ''
    const status =
      '$metadata' in error
        ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined
    return name === 'NotFound' || name === 'NoSuchKey' || status === 404
  }

  private isEnoent(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'ENOENT',
    )
  }
}
