#!/usr/bin/env tsx
/**
 * Copy VPS uploads into Cloudflare R2 without deleting source files.
 *
 *   npx tsx scripts/media-migrate-to-r2.ts --dry-run
 *   npx tsx scripts/media-migrate-to-r2.ts
 */
import { readdir, readFile, stat } from 'fs/promises'
import { extname, join, relative, resolve } from 'path'
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

import { classifyUploadRootFile } from '../src/media/media-keys'
import { getEstimatePhotosRoot, getUploadRoot } from '../src/media/storage.config'

type ResultRow = {
  diskRelative: string
  key?: string
  kind: string
  status: 'would-upload' | 'uploaded' | 'skipped-exists' | 'unmapped' | 'error'
  error?: string
}

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes('--dry-run'),
  }
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.webp':
      return 'image/webp'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    default:
      return 'application/octet-stream'
  }
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(abs)
      } else if (entry.isFile()) {
        out.push(abs)
      }
    }
  }
  await walk(root)
  return out
}

function createClient() {
  const endpoint = process.env.R2_ENDPOINT?.trim()
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim()
  const bucket = process.env.R2_BUCKET?.trim()
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'Missing R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, or R2_BUCKET.',
    )
  }
  return {
    bucket,
    client: new S3Client({
      region: process.env.R2_REGION?.trim() || 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    }),
  }
}

async function objectExists(
  client: S3Client,
  bucket: string,
  key: string,
  size: number,
): Promise<boolean> {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return (head.ContentLength ?? -1) === size
  } catch (error: unknown) {
    const status =
      error && typeof error === 'object' && '$metadata' in error
        ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined
    const name = error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: string }).name)
      : ''
    if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') return false
    throw error
  }
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2))
  const uploadRoot = getUploadRoot()
  const estimateRoot = getEstimatePhotosRoot()
  const files = new Map<string, string>()

  for (const abs of await walkFiles(uploadRoot)) {
    files.set(relative(uploadRoot, abs).replace(/\\/g, '/'), abs)
  }
  if (resolve(estimateRoot) !== resolve(join(uploadRoot, 'estimate-photos'))) {
    for (const abs of await walkFiles(estimateRoot)) {
      const rel = `estimate-photos/${relative(estimateRoot, abs).replace(/\\/g, '/')}`
      files.set(rel, abs)
    }
  }

  const rows: ResultRow[] = []
  let client: S3Client | null = null
  let bucket = ''
  if (!dryRun) {
    const created = createClient()
    client = created.client
    bucket = created.bucket
  } else {
    try {
      createClient()
    } catch (error) {
      console.warn(`dry-run: ${(error as Error).message} (listing only)`)
    }
  }

  for (const [diskRelative, abs] of [...files.entries()].sort()) {
    const classified = classifyUploadRootFile(diskRelative)
    if (classified.kind === 'unmapped') {
      rows.push({ diskRelative, kind: 'unmapped', status: 'unmapped' })
      continue
    }
    const info = await stat(abs)
    if (dryRun) {
      rows.push({
        diskRelative,
        key: classified.key,
        kind: classified.kind,
        status: 'would-upload',
      })
      continue
    }
    try {
      const exists = await objectExists(client!, bucket, classified.key, info.size)
      if (exists) {
        rows.push({
          diskRelative,
          key: classified.key,
          kind: classified.kind,
          status: 'skipped-exists',
        })
        continue
      }
      const body = await readFile(abs)
      await client!.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: classified.key,
          Body: body,
          ContentType: contentTypeFor(abs),
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      )
      const verified = await objectExists(client!, bucket, classified.key, body.byteLength)
      if (!verified) {
        throw new Error('HeadObject size mismatch after upload')
      }
      rows.push({
        diskRelative,
        key: classified.key,
        kind: classified.kind,
        status: 'uploaded',
      })
    } catch (error) {
      rows.push({
        diskRelative,
        key: classified.key,
        kind: classified.kind,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const counts = {
    wouldUpload: rows.filter((r) => r.status === 'would-upload').length,
    uploaded: rows.filter((r) => r.status === 'uploaded').length,
    skipped: rows.filter((r) => r.status === 'skipped-exists').length,
    unmapped: rows.filter((r) => r.status === 'unmapped').length,
    error: rows.filter((r) => r.status === 'error').length,
  }

  console.log(JSON.stringify({ dryRun, uploadRoot, estimateRoot, counts, rows }, null, 2))
  if (counts.error > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
