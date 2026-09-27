#!/usr/bin/env tsx
/**
 * Private R2 / local private storage smoke test.
 * - Never prints credentials
 * - Never touches the public media bucket
 * - Uses a temporary key under orders/_smoke/
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ConfigService } from '@nestjs/config'

import {
  isPrivateObjectKey,
  keyToPublicPath,
  orderConfirmationPdfKey,
} from '../src/media/media-keys'
import { MediaStorageService } from '../src/media/media-storage.service'

function loadDotEnv(path: string) {
  if (!existsSync(path)) return
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] == null) process.env[key] = value
  }
}

async function main() {
  loadDotEnv(resolve(__dirname, '../.env'))

  assert.equal(orderConfirmationPdfKey('ord-abc'), 'orders/ord-abc/confirmation.pdf')
  assert.equal(isPrivateObjectKey('orders/ord-abc/confirmation.pdf'), true)
  assert.equal(isPrivateObjectKey('private/orders/ord-abc/confirmation.pdf'), true)
  assert.equal(isPrivateObjectKey('uploads/products/x.webp'), false)
  assert.throws(() => keyToPublicPath('orders/ord-abc/confirmation.pdf'))

  const storage = new MediaStorageService(new ConfigService())
  storage.onModuleInit()

  const driver = storage.getDriver()
  const publicBucket = storage.getPublicBucketNameForTests()
  const privateBucket = storage.getPrivateBucketNameForTests()

  if (driver === 'r2') {
    assert.ok(privateBucket, 'private bucket must be configured in r2 mode')
    assert.notEqual(privateBucket, publicBucket, 'private bucket must differ from public')
  }

  const key = `orders/_smoke/${Date.now()}.txt`
  const payload = Buffer.from(`private-smoke-${Date.now()}`, 'utf8')

  await storage.putPrivateObject({
    key,
    body: payload,
    contentType: 'text/plain',
  })
  const roundTrip = await storage.getPrivateObject(key)
  assert.equal(roundTrip.equals(payload), true)

  await assert.rejects(
    () =>
      storage.putObject({
        key,
        body: payload,
        contentType: 'text/plain',
      }),
    /putPrivateObject|приватн/i,
  )

  await storage.deletePrivateObject(key)
  const gone = await storage.headObject(key)
  assert.equal(gone, null)

  console.log(
    `r2-private-smoke: ok driver=${driver} publicBucket=${publicBucket || '(local)'} privateBucket=${privateBucket || '(local)'}`,
  )
  if (driver !== 'r2') {
    console.log(
      'r2-private-smoke: local driver used — re-run after Coolify sets MEDIA_DRIVER=r2 + R2_PRIVATE_* to verify live private bucket.',
    )
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
