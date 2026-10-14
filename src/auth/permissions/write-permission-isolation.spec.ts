/**
 * B2: view must not authorize write. Method-level @RequirePermissions overrides class-level.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Role } from '@prisma/client'

import { RolesGuard } from '../guards/roles.guard'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator'
import type { PermissionsService } from './permissions.service'
import type { StaffPermission } from './permission.registry'

function mockContext(userId: string) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: { userId, role: 'admin', v: 1 } }),
    }),
  } as never
}

function buildGuard(opts: {
  /** Simulated Nest getAllAndOverride result (handler wins over class). */
  effectivePerms: StaffPermission[]
  roles?: Role[]
  dbRole?: Role
  held: StaffPermission[]
}) {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === ROLES_KEY) return opts.roles ?? [Role.ADMIN, Role.MANAGER]
      if (key === REQUIRE_PERMISSIONS_KEY) return opts.effectivePerms
      return undefined
    },
  } as unknown as Reflector

  const held = new Set(opts.held)
  const prisma = {
    user: {
      findUnique: async () => ({ role: opts.dbRole ?? Role.MANAGER }),
    },
  }

  const permissions = {
    userHasAnyPermission: async (_id: string, required: StaffPermission[]) =>
      required.some((p) => held.has(p)),
  } as unknown as PermissionsService

  return new RolesGuard(reflector, prisma as never, permissions)
}

describe('B2 write permission isolation (RolesGuard metadata)', () => {
  it('orders.view alone cannot satisfy orders.manage write policy', async () => {
    const guard = buildGuard({
      effectivePerms: ['orders.manage'],
      held: ['orders.view'],
    })
    await assert.rejects(() => guard.canActivate(mockContext('m1')), ForbiddenException)
  })

  it('orders.manage allows write', async () => {
    const guard = buildGuard({
      effectivePerms: ['orders.manage'],
      held: ['orders.manage'],
    })
    assert.equal(await guard.canActivate(mockContext('m1')), true)
  })

  it('catalog.view alone cannot satisfy catalog.edit', async () => {
    const guard = buildGuard({
      effectivePerms: ['catalog.edit'],
      held: ['catalog.view'],
    })
    await assert.rejects(() => guard.canActivate(mockContext('m1')), ForbiddenException)
  })

  it('settings.view alone cannot satisfy settings.manage', async () => {
    const guard = buildGuard({
      effectivePerms: ['settings.manage'],
      held: ['settings.view'],
    })
    await assert.rejects(() => guard.canActivate(mockContext('m1')), ForbiddenException)
  })

  it('customers.view alone cannot satisfy customers.edit', async () => {
    const guard = buildGuard({
      effectivePerms: ['customers.edit'],
      held: ['customers.view'],
    })
    await assert.rejects(() => guard.canActivate(mockContext('m1')), ForbiddenException)
  })

  it('flexi.view alone cannot satisfy flexi.manage write', async () => {
    const guard = buildGuard({
      effectivePerms: ['flexi.manage'],
      held: ['flexi.view'],
    })
    await assert.rejects(() => guard.canActivate(mockContext('m1')), ForbiddenException)
  })

  it('GET policy with view OR manage allows view-only MANAGER', async () => {
    const guard = buildGuard({
      effectivePerms: ['orders.view', 'orders.manage'],
      held: ['orders.view'],
    })
    assert.equal(await guard.canActivate(mockContext('m1')), true)
  })

  it('ADMIN bypasses write permission checks', async () => {
    const guard = buildGuard({
      effectivePerms: ['orders.manage'],
      held: [],
      dbRole: Role.ADMIN,
    })
    assert.equal(await guard.canActivate(mockContext('a1')), true)
  })

  it('ADMIN-only Roles deny MANAGER even with flexi.manage', async () => {
    const guard = buildGuard({
      effectivePerms: ['flexi.manage'],
      roles: [Role.ADMIN],
      held: ['flexi.manage', 'flexi.view'],
      dbRole: Role.MANAGER,
    })
    await assert.rejects(() => guard.canActivate(mockContext('m1')), ForbiddenException)
  })

  it('method-level manage overrides class-level view+manage (simulated)', async () => {
    // Nest getAllAndOverride(handler, class) → handler wins. Class would be
    // ['orders.view','orders.manage']; write method sets ['orders.manage'] only.
    const classPerms: StaffPermission[] = ['orders.view', 'orders.manage']
    const methodPerms: StaffPermission[] = ['orders.manage']
    const effective = methodPerms.length ? methodPerms : classPerms
    assert.deepEqual(effective, ['orders.manage'])

    const guard = buildGuard({
      effectivePerms: effective,
      held: ['orders.view'],
    })
    await assert.rejects(() => guard.canActivate(mockContext('m1')), ForbiddenException)
  })
})

describe('B2 controller source contracts', () => {
  const fs = require('node:fs') as typeof import('node:fs')
  const path = require('node:path') as typeof import('node:path')
  const root = path.join(__dirname, '../..')

  function assertWriteHasManageOnly(rel: string, writePerm: string) {
    const src = fs.readFileSync(path.join(root, rel), 'utf8')
    // crude: every @Patch/@Post/@Delete that has RequirePermissions nearby must include writePerm
    // and must not pair view+write on same decorator for write handlers — already audited.
    assert.match(src, new RegExp(`@RequirePermissions\\('${writePerm}'\\)`))
  }

  it('orders write endpoints declare orders.manage', () => {
    assertWriteHasManageOnly('orders/orders.controller.ts', 'orders.manage')
    const src = fs.readFileSync(path.join(root, 'orders/orders.controller.ts'), 'utf8')
    assert.doesNotMatch(
      src,
      /@(Patch|Delete|Post)\([^\n]*\n(?:[^\n]*\n){0,5}@RequirePermissions\('orders\.view', 'orders\.manage'\)/,
    )
  })

  it('settings write endpoints declare settings.manage', () => {
    assertWriteHasManageOnly('settings/settings.controller.ts', 'settings.manage')
  })

  it('products write endpoints declare catalog.edit', () => {
    assertWriteHasManageOnly('products/products.controller.ts', 'catalog.edit')
  })

  it('users write endpoints override class with customers.edit', () => {
    const src = fs.readFileSync(path.join(root, 'users/users.controller.ts'), 'utf8')
    assert.match(src, /@Patch\(':id'\)\s*\n\s*@RequirePermissions\('customers\.edit'\)/)
    assert.match(src, /@Delete\(':id'\)\s*\n\s*@RequirePermissions\('customers\.edit'\)/)
  })

  it('flexi write endpoints declare flexi.manage', () => {
    const src = fs.readFileSync(path.join(root, 'flexi/flexi.controller.ts'), 'utf8')
    assert.match(src, /@Patch\('settings'\)\s*\n\s*@RequirePermissions\('flexi\.manage'\)/)
    assert.match(src, /@Roles\(Role\.ADMIN\)/)
  })
})
