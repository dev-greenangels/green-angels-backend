import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Role } from '@prisma/client'

import { RolesGuard } from './roles.guard'
import type { PermissionsService } from '../permissions/permissions.service'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator'

function mockContext(userId: string | undefined) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: userId ? { userId, role: 'admin', v: 1 } : undefined }),
    }),
  } as never
}

function buildGuard(opts: {
  roles: Role[]
  requiredPerms?: string[] | null
  dbRole?: Role
  hasPerm?: boolean
  dbError?: boolean
}) {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === ROLES_KEY) return opts.roles
      if (key === REQUIRE_PERMISSIONS_KEY) return opts.requiredPerms ?? undefined
      return undefined
    },
  } as unknown as Reflector

  const prisma = {
    user: {
      findUnique: async () => {
        if (opts.dbError) throw new Error('db down')
        return opts.dbRole ? { role: opts.dbRole } : null
      },
    },
  }

  const permissions = {
    userHasAnyPermission: async () => {
      if (opts.dbError) throw new Error('db down')
      return opts.hasPerm === true
    },
  } as unknown as PermissionsService

  return new RolesGuard(reflector, prisma as never, permissions)
}

describe('RolesGuard fail-closed permissions', () => {
  it('ADMIN bypasses permission checks', async () => {
    const guard = buildGuard({
      roles: [Role.ADMIN, Role.MANAGER],
      requiredPerms: ['orders.view'],
      dbRole: Role.ADMIN,
      hasPerm: false,
    })
    assert.equal(await guard.canActivate(mockContext('admin-1')), true)
  })

  it('MANAGER with permission → allow', async () => {
    const guard = buildGuard({
      roles: [Role.ADMIN, Role.MANAGER],
      requiredPerms: ['orders.view'],
      dbRole: Role.MANAGER,
      hasPerm: true,
    })
    assert.equal(await guard.canActivate(mockContext('mgr-1')), true)
  })

  it('MANAGER without permission → 403', async () => {
    const guard = buildGuard({
      roles: [Role.ADMIN, Role.MANAGER],
      requiredPerms: ['orders.view'],
      dbRole: Role.MANAGER,
      hasPerm: false,
    })
    await assert.rejects(() => guard.canActivate(mockContext('mgr-1')), ForbiddenException)
  })

  it('MANAGER on route without @RequirePermissions → 403', async () => {
    const guard = buildGuard({
      roles: [Role.ADMIN, Role.MANAGER],
      requiredPerms: null,
      dbRole: Role.MANAGER,
      hasPerm: true,
    })
    await assert.rejects(() => guard.canActivate(mockContext('mgr-1')), ForbiddenException)
  })

  it('DB failure → ServiceUnavailable (fail-closed, not open)', async () => {
    const guard = buildGuard({
      roles: [Role.ADMIN, Role.MANAGER],
      requiredPerms: ['orders.view'],
      dbRole: Role.MANAGER,
      dbError: true,
    })
    await assert.rejects(
      () => guard.canActivate(mockContext('mgr-1')),
      ServiceUnavailableException,
    )
  })

  it('revoke reflected on next request (DB-backed hasPerm=false)', async () => {
    const guard = buildGuard({
      roles: [Role.ADMIN, Role.MANAGER],
      requiredPerms: ['orders.view'],
      dbRole: Role.MANAGER,
      hasPerm: false,
    })
    await assert.rejects(() => guard.canActivate(mockContext('mgr-1')), ForbiddenException)
  })
})
