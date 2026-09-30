import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { FLEXI_CHANGE_EVENT_CREATE_ENTRYPOINTS } from './flexi-legacy-evidence.classification'

/**
 * Regression: normal runtime must not create FlexiChangeEvent rows.
 * Growth 57k→98k on production is explained by *legacy* writers before current-state cutover;
 * this suite guards the current tree.
 */
describe('FlexiChangeEvent writers (no normal-runtime creates)', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')

  it('documents sole create entrypoint', () => {
    assert.equal(FLEXI_CHANGE_EVENT_CREATE_ENTRYPOINTS.length, 1)
    assert.equal(FLEXI_CHANGE_EVENT_CREATE_ENTRYPOINTS[0], 'FlexiChangeIntakeService.ingestChanges')
  })

  it('ingestChanges is never called outside change-intake.service.ts', () => {
    const files = [
      'flexi.controller.ts',
      'flexi.service.ts',
      'flexi.processor.ts',
      'flexi.queue.service.ts',
      'flexi-live-sync.service.ts',
      'flexi-auto-sync.service.ts',
      'flexi-full-refresh.service.ts',
      'flexi-order-reconcile.service.ts',
      'flexi.backlog-cleanup.service.ts',
    ]
    for (const file of files) {
      const src = readFileSync(join(root, 'flexi', file), 'utf8')
      assert.equal(
        src.includes('ingestChanges('),
        false,
        `${file} must not call ingestChanges`,
      )
      assert.equal(
        /flexiChangeEvent\.create(Many)?\s*\(/.test(src),
        false,
        `${file} must not prisma.flexiChangeEvent.create`,
      )
    }
  })

  it('webhook controller routes to live enqueue, not intake', () => {
    const src = readFileSync(join(root, 'flexi', 'flexi.controller.ts'), 'utf8')
    assert.ok(src.includes('enqueueFromChangeEntries'))
    assert.equal(src.includes('ingestChanges('), false)
  })

  it('processDurableIntake has no callers (legacy drain retired)', () => {
    const service = readFileSync(join(root, 'flexi', 'flexi.service.ts'), 'utf8')
    assert.ok(service.includes('async processDurableIntake'))
    const others = [
      'flexi.controller.ts',
      'flexi.processor.ts',
      'flexi.queue.service.ts',
      'flexi-live-sync.service.ts',
    ]
    for (const file of others) {
      const src = readFileSync(join(root, 'flexi', file), 'utf8')
      assert.equal(src.includes('processDurableIntake('), false, file)
    }
  })
})
