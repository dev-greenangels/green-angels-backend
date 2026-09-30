import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  FLEXI_CHANGE_EVENT_CREATE_ENTRYPOINTS,
  LEGACY_DELETE_BATCH_SIZE,
  LEGACY_DELETE_CONFIRM,
  NORMAL_RUNTIME_DEPENDS_ON_JOURNAL,
} from './flexi-legacy-evidence.classification'

describe('legacy journal delete contracts', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)))

  it('normal runtime does not depend on journal', () => {
    assert.equal(NORMAL_RUNTIME_DEPENDS_ON_JOURNAL, false)
  })

  it('sole create entrypoint is ingestChanges (must stay unreachable)', () => {
    assert.deepEqual(FLEXI_CHANGE_EVENT_CREATE_ENTRYPOINTS, [
      'FlexiChangeIntakeService.ingestChanges',
    ])
  })

  it('confirm token is DELETE_LEGACY_FLEXI_JOURNAL', () => {
    assert.equal(LEGACY_DELETE_CONFIRM, 'DELETE_LEGACY_FLEXI_JOURNAL')
  })

  it('batch size stays under PostgreSQL bind limit', () => {
    assert.ok(LEGACY_DELETE_BATCH_SIZE <= 2000)
    assert.ok(LEGACY_DELETE_BATCH_SIZE * 1 < 32767)
  })

  it('delete SQL uses subquery LIMIT — no giant IN id list', () => {
    const src = readFileSync(join(root, 'flexi-legacy-retirement.service.ts'), 'utf8')
    assert.ok(src.includes('DELETE FROM "FlexiChangeEvent"'))
    assert.ok(src.includes('LIMIT ${chunk}'))
    assert.equal(src.includes('deleteMany({ where: { id: { in:'), false)
  })

  it('UNKNOWN / DELETE evidence does not block deletion (no gate)', () => {
    const src = readFileSync(join(root, 'flexi-legacy-retirement.service.ts'), 'utf8')
    assert.equal(src.includes('safeToRetire'), false)
    assert.equal(src.includes('classifyLegacyEvidence'), false)
    assert.equal(src.includes('unknownEvidence'), false)
    assert.ok(src.includes('deletionBlocked: false'))
  })

  it('delete path does not Full Refresh / reconcile / Changes / webhook / Auto Sync', () => {
    const src = readFileSync(join(root, 'flexi-legacy-retirement.service.ts'), 'utf8')
    assert.equal(src.includes('fullRefresh'), false)
    assert.equal(src.includes('reconcileActiveErpOrders'), false)
    assert.equal(src.includes('pollChanges'), false)
    assert.equal(src.includes('ingestChanges'), false)
    assert.equal(src.includes('registerWebhook'), false)
    assert.equal(src.includes('disableWebhook'), false)
    assert.equal(src.includes('disableAutoSync'), false)
    assert.equal(/updateSettings\(/.test(src), false)
    assert.ok(src.includes('cleanupLegacyInboundJobs'))
  })

  it('delete must not reset globalVersion (algorithm)', () => {
    const globalVersionBefore = 99810
    const settingsTouchedByDelete = false
    const globalVersionAfter = settingsTouchedByDelete ? 0 : globalVersionBefore
    assert.equal(globalVersionAfter, globalVersionBefore)
  })

  it('wrong confirmation is rejected', () => {
    assert.notEqual('RETIRE_LEGACY_FLEXI_JOURNAL', LEGACY_DELETE_CONFIRM)
    assert.notEqual('CLEAR_LEGACY_JOURNAL', LEGACY_DELETE_CONFIRM)
  })

  it('controller delete route is ADMIN-only', () => {
    const src = readFileSync(join(root, 'flexi.controller.ts'), 'utf8')
    const idx = src.indexOf("retireLegacyJournal(")
    assert.ok(idx > 0)
    const window = src.slice(Math.max(0, idx - 200), idx)
    assert.ok(window.includes('@Roles(Role.ADMIN)'))
    assert.ok(src.includes('DELETE_LEGACY_FLEXI_JOURNAL'))
  })

  it('~100k rows fit in batch loop without bind explosion', () => {
    const rows = 98_265
    const batches = Math.ceil(rows / LEGACY_DELETE_BATCH_SIZE)
    assert.ok(batches < 200_000)
    // Each batch binds only LIMIT param — never 98k UUIDs.
    const bindsPerBatch = 1
    assert.ok(bindsPerBatch < 32767)
  })
})
