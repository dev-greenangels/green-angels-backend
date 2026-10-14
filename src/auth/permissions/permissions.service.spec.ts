import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Role } from '@prisma/client'

import { existingPermissionKeys } from './permission.registry'
import { PermissionsService } from './permissions.service'

type FakeUser = { id: string; role: Role }

function createService(opts: {
  users: FakeUser[]
  grants?: Array<{ userId: string; permission: string }>
}) {
  const grants = [...(opts.grants ?? [])]
  const users = [...opts.users]

  const prisma = {
    user: {
      findUnique: async ({
        where,
        select,
      }: {
        where: { id: string }
        select?: { role?: boolean; id?: boolean }
      }) => {
        const u = users.find((x) => x.id === where.id)
        if (!u) return null
        if (select?.role && select?.id) return { id: u.id, role: u.role }
        if (select?.role) return { role: u.role }
        return u
      },
    },
    userPermission: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        grants
          .filter((g) => g.userId === where.userId)
          .map((g) => ({ permission: g.permission })),
      count: async ({
        where,
      }: {
        where: { userId: string; permission: { in: string[] } }
      }) =>
        grants.filter(
          (g) =>
            g.userId === where.userId && where.permission.in.includes(g.permission),
        ).length,
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        for (let i = grants.length - 1; i >= 0; i -= 1) {
          if (grants[i].userId === where.userId) grants.splice(i, 1)
        }
      },
      createMany: async ({
        data,
      }: {
        data: Array<{ userId: string; permission: string; createdByUserId: string }>
      }) => {
        for (const row of data) {
          grants.push({ userId: row.userId, permission: row.permission })
        }
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  }

  return {
    service: new PermissionsService(prisma as never),
    grants,
  }
}

describe('PermissionsService', () => {
  it('ADMIN gets all existing keys', async () => {
    const { service } = createService({
      users: [{ id: 'a1', role: Role.ADMIN }],
    })
    assert.deepEqual(await service.getUserPermissions('a1'), existingPermissionKeys())
  })

  it('MANAGER without grants → empty', async () => {
    const { service } = createService({
      users: [{ id: 'm1', role: Role.MANAGER }],
    })
    assert.deepEqual(await service.getUserPermissions('m1'), [])
  })

  it('MANAGER with grants → listed keys only', async () => {
    const { service } = createService({
      users: [{ id: 'm1', role: Role.MANAGER }],
      grants: [
        { userId: 'm1', permission: 'orders.view' },
        { userId: 'm1', permission: 'catalog.view' },
      ],
    })
    const perms = await service.getUserPermissions('m1')
    assert.deepEqual(perms.sort(), ['catalog.view', 'orders.view'])
  })

  it('userHasAnyPermission: ADMIN true, MANAGER OR match', async () => {
    const { service } = createService({
      users: [
        { id: 'a1', role: Role.ADMIN },
        { id: 'm1', role: Role.MANAGER },
      ],
      grants: [{ userId: 'm1', permission: 'orders.view' }],
    })
    assert.equal(await service.userHasAnyPermission('a1', ['orders.manage']), true)
    assert.equal(await service.userHasAnyPermission('m1', ['orders.view']), true)
    assert.equal(await service.userHasAnyPermission('m1', ['orders.manage']), false)
    assert.equal(await service.userHasAnyPermission('m1', ['backoffice.access']), false)
  })

  it('replaceManagerPermissions replaces set', async () => {
    const { service, grants } = createService({
      users: [
        { id: 'a1', role: Role.ADMIN },
        { id: 'm1', role: Role.MANAGER },
      ],
      grants: [{ userId: 'm1', permission: 'catalog.view' }],
    })
    const saved = await service.replaceManagerPermissions(
      'm1',
      ['catalog.view', 'backoffice.access'],
      'a1',
    )
    assert.deepEqual(saved.sort(), ['backoffice.access', 'catalog.view'])
    assert.equal(
      grants.filter((g) => g.userId === 'm1').length,
      2,
    )
  })

  it('replaceManagerPermissions rejects non-ADMIN actor', async () => {
    const { service } = createService({
      users: [
        { id: 'm1', role: Role.MANAGER },
        { id: 'm2', role: Role.MANAGER },
      ],
    })
    await assert.rejects(
      () => service.replaceManagerPermissions('m2', ['orders.view'], 'm1'),
      ForbiddenException,
    )
  })

  it('getUserPermissions unknown user → NotFound', async () => {
    const { service } = createService({ users: [] })
    await assert.rejects(() => service.getUserPermissions('x'), NotFoundException)
  })
})
