import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  LEGACY_NURSERY_GALLERY_PLACEHOLDER_PATHS,
  sanitizeCmsImageUrl,
} from './cms-image-url'

describe('sanitizeCmsImageUrl — legacy nursery gallery placeholders', () => {
  it('clears the four known missing /images/nursery/*.jpg seed URLs', () => {
    for (const path of LEGACY_NURSERY_GALLERY_PLACEHOLDER_PATHS) {
      assert.equal(sanitizeCmsImageUrl(path), '', path)
      assert.equal(sanitizeCmsImageUrl(`${path}?cache=1`), '', `query ${path}`)
    }
  })

  it('preserves real CMS / R2 photo URLs so home normalize does not blank them', () => {
    assert.equal(
      sanitizeCmsImageUrl('/images/hero-nursery.png'),
      '/images/hero-nursery.png',
    )
    assert.equal(
      sanitizeCmsImageUrl('https://cdn.example.com/uploads/home/nursery-1.webp'),
      'https://cdn.example.com/uploads/home/nursery-1.webp',
    )
  })
})
