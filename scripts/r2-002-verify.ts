#!/usr/bin/env tsx
/**
 * R2-002: identity, key namespace, production driver (no live R2 required).
 */
import assert from 'node:assert/strict'

import { resolveMediaDriver } from '../src/media/media-driver'
import {
  classifyUploadRootFile,
  estimateRelativeToKey,
  publicPathToKey,
} from '../src/media/media-keys'
import {
  estimateFolderForType,
  isFreshPhotoIdentity,
  resolveFreshPhotoIdentity,
} from '../src/photos/fresh-photo-identity'

function expectIdentity(
  input: Parameters<typeof resolveFreshPhotoIdentity>[0],
  type: 'EAN' | 'SKU',
  identifier: string,
) {
  const resolved = resolveFreshPhotoIdentity(input)
  assert.equal(isFreshPhotoIdentity(resolved), true)
  if (!isFreshPhotoIdentity(resolved)) return
  assert.equal(resolved.identifierType, type)
  assert.equal(resolved.identifier, identifier)
}

function main() {
  expectIdentity({ barcode: '4820000000001' }, 'EAN', '4820000000001')
  expectIdentity({ sku: 'SK-TUJA-001' }, 'SKU', 'SK-TUJA-001')
  expectIdentity({ barcode: '4820000000001', sku: 'SK-TUJA-001' }, 'EAN', '4820000000001')
  expectIdentity(
    { barcode: '', sku: 'SK-TUJA-001' },
    'SKU',
    'SK-TUJA-001',
  )
  expectIdentity(
    { identifierType: 'sku', identifier: 'SK-TUJA-001' },
    'SKU',
    'SK-TUJA-001',
  )
  expectIdentity(
    { identifierType: 'ean', identifier: '4820000000001' },
    'EAN',
    '4820000000001',
  )
  expectIdentity(
    { identifierType: 'sku', sku: 'SK-TUJA-001', barcode: '4820000000001' },
    'SKU',
    'SK-TUJA-001',
  )

  const missing = resolveFreshPhotoIdentity({ barcode: '', sku: '' })
  assert.equal(isFreshPhotoIdentity(missing), false)

  const sameValue = '4820000000001'
  const eanRel = `${estimateFolderForType('EAN')}/${sameValue}/file.jpg`
  const skuRel = `${estimateFolderForType('SKU')}/${sameValue}/file.jpg`
  assert.equal(eanRel, 'ean/4820000000001/file.jpg')
  assert.equal(skuRel, 'sku/4820000000001/file.jpg')
  assert.notEqual(eanRel, skuRel)
  assert.equal(
    estimateRelativeToKey(eanRel),
    'uploads/estimate-photos/ean/4820000000001/file.jpg',
  )
  assert.equal(
    estimateRelativeToKey(skuRel),
    'uploads/estimate-photos/sku/4820000000001/file.jpg',
  )

  const legacyRel = '4820000000001/old-file.jpg'
  assert.equal(
    estimateRelativeToKey(legacyRel),
    'uploads/estimate-photos/4820000000001/old-file.jpg',
  )

  assert.equal(
    publicPathToKey(
      '/uploads/products/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/main.webp',
    ),
    'uploads/products/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/main.webp',
  )
  assert.equal(classifyUploadRootFile('categories/x/v1/cover.webp').kind, 'category')
  assert.equal(classifyUploadRootFile('blog/x/cover.webp').kind, 'blog')
  assert.equal(classifyUploadRootFile('reviews/abc.webp').kind, 'review')
  assert.equal(classifyUploadRootFile('estimate-photos/ean/1/a.jpg').kind, 'estimate')
  assert.equal(classifyUploadRootFile('estimate-photos/sku/1/a.jpg').kind, 'estimate')
  assert.equal(classifyUploadRootFile('estimate-photos/1/legacy.jpg').kind, 'estimate')

  const prod = resolveMediaDriver({
    nodeEnv: 'production',
    mediaDriver: 'local',
    keepLocal: 'true',
  })
  assert.equal(prod.driver, 'r2')
  assert.equal(prod.keepLocal, false)

  const prodExplicit = resolveMediaDriver({
    nodeEnv: 'production',
    mediaDriver: 'r2',
    keepLocal: 'true',
  })
  assert.equal(prodExplicit.driver, 'r2')
  assert.equal(prodExplicit.keepLocal, false)

  const devLocal = resolveMediaDriver({ nodeEnv: 'development' })
  assert.equal(devLocal.driver, 'local')
  assert.equal(devLocal.keepLocal, false)

  const devR2Keep = resolveMediaDriver({
    nodeEnv: 'development',
    mediaDriver: 'r2',
    keepLocal: 'true',
  })
  assert.equal(devR2Keep.driver, 'r2')
  assert.equal(devR2Keep.keepLocal, true)

  console.log('r2-002-verify: ok')
}

main()
