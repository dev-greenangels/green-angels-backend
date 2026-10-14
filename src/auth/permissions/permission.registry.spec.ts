import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  existingPermissionKeys,
  isStaffPermission,
  permissionDefinitionsForUi,
  PERMISSION_REGISTRY,
} from './permission.registry'

describe('permission.registry', () => {
  it('has unique keys', () => {
    const keys = PERMISSION_REGISTRY.map((p) => p.key)
    assert.equal(new Set(keys).size, keys.length)
  })

  it('UI list excludes PLANNED', () => {
    assert.ok(permissionDefinitionsForUi().every((p) => p.status === 'EXISTING'))
    assert.ok(!permissionDefinitionsForUi().some((p) => p.key === 'inventory.post'))
  })

  it('existing keys include access + photos view/manage', () => {
    const keys = existingPermissionKeys()
    assert.ok(keys.includes('backoffice.access'))
    assert.ok(keys.includes('plantstock.access'))
    assert.ok(keys.includes('photos.view'))
    assert.ok(keys.includes('photos.manage'))
    assert.ok(!keys.includes('inventory.post'))
  })

  it('isStaffPermission rejects unknown', () => {
    assert.equal(isStaffPermission('orders.view'), true)
    assert.equal(isStaffPermission('nope'), false)
  })
})
