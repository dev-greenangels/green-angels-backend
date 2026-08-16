#!/usr/bin/env tsx
/**
 * Local key/URL/idempotency checks for R2-001 (no new test framework).
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  classifyUploadRootFile,
  diskRelativeToKey,
  estimateRelativeToKey,
  publicPathToKey,
} from '../src/media/media-keys'
import { toPublicMediaUrl } from '../src/media/media-url'

async function main() {
  const productPath = '/uploads/products/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/main.webp'
  const freshRel = '5901234567890/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa_plant_C2.jpg'
  const estimateKey = estimateRelativeToKey(freshRel)
  const productKey = publicPathToKey(productPath)

  assert.equal(
    productKey,
    'uploads/products/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/main.webp',
  )
  assert.equal(estimateKey, `uploads/estimate-photos/${freshRel}`)
  assert.notEqual(productKey, estimateKey)

  const classifiedProduct = classifyUploadRootFile(
    'products/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/main.webp',
  )
  const classifiedFresh = classifyUploadRootFile(`estimate-photos/${freshRel}`)
  const classifiedUnknown = classifyUploadRootFile('tmp/scratch.bin')
  assert.equal(classifiedProduct.kind, 'product')
  assert.equal(classifiedFresh.kind, 'estimate')
  assert.equal(classifiedUnknown.kind, 'unmapped')

  assert.equal(
    toPublicMediaUrl(productPath, 'https://media.example.com'),
    `https://media.example.com${productPath}`,
  )
  assert.equal(toPublicMediaUrl(productPath, ''), productPath)
  assert.equal(
    toPublicMediaUrl('https://media.example.com/uploads/already.webp', 'https://other.example'),
    'https://media.example.com/uploads/already.webp',
  )

  const dir = await mkdtemp(join(tmpdir(), 'r2-001-'))
  try {
    const first = Buffer.from('first')
    const second = Buffer.from('second-replace')
    const file = join(dir, 'object.bin')
    await writeFile(file, first)
    await writeFile(file, second)
    const { readFile } = await import('node:fs/promises')
    assert.equal((await readFile(file)).equals(second), true)
    assert.equal(diskRelativeToKey('reviews/abc.webp'), 'uploads/reviews/abc.webp')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  console.log('r2-001-verify: ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
