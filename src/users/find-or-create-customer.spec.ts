import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { Role } from '@prisma/client'

import { UsersService } from './users.service'

const NEW_PHONE = '+421900000001'
const ADMIN_PHONE = '+380000000000'

function createUsersService(prisma: unknown) {
  return new UsersService(prisma as never)
}

describe('findOrCreateCustomer — proven contact identity', () => {
  it('creates a USER when phone is new even if ADMIN has a historical order with that customerPhone', async () => {
    const created = { id: 'new-customer' }
    let orderLookedUp = false
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: { phone?: string; email?: string } }) => {
          if (where.phone === NEW_PHONE) return null
          if (where.email) return null
          return null
        },
        create: async ({ data }: { data: { phone: string | null; role?: Role } }) => {
          assert.equal(data.phone, NEW_PHONE)
          assert.equal(data.role, Role.USER)
          return created
        },
        update: async () => {
          throw new Error('must not mutate ADMIN or any existing User')
        },
      },
      order: {
        findFirst: async () => {
          orderLookedUp = true
          return { userId: 'admin-id' }
        },
      },
    }

    const id = await createUsersService(prisma).findOrCreateCustomer({
      phone: NEW_PHONE,
      firstName: 'Peter',
      lastName: 'Novak',
    })

    assert.equal(id, 'new-customer')
    assert.equal(orderLookedUp, false)
  })

  it('returns the existing customer when User.phone already matches', async () => {
    const existing = {
      id: 'user-b',
      phone: NEW_PHONE,
      email: null,
      firstName: 'B',
      lastName: 'Customer',
      patronymic: null,
      role: Role.USER,
    }
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: { phone?: string; id?: string } }) => {
          if (where.phone === NEW_PHONE || where.id === 'user-b') return existing
          return null
        },
        update: async ({ where }: { where: { id: string } }) => {
          assert.equal(where.id, 'user-b')
          return { id: 'user-b' }
        },
        create: async () => {
          throw new Error('must not create a second User for an owned phone')
        },
      },
      order: {
        findFirst: async () => {
          throw new Error('must not resolve identity from orders')
        },
      },
    }

    const id = await createUsersService(prisma).findOrCreateCustomer({
      phone: NEW_PHONE,
      firstName: 'B',
      lastName: 'Customer',
    })
    assert.equal(id, 'user-b')
  })

  it('creates a USER for a new email without consulting Order.customerEmail', async () => {
    const created = { id: 'email-customer' }
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: { phone?: string; email?: string } }) => {
          if (where.email === 'new@example.com') return null
          return null
        },
        create: async ({ data }: { data: { email: string | null; role?: Role } }) => {
          assert.equal(data.email, 'new@example.com')
          assert.equal(data.role, Role.USER)
          return created
        },
        update: async () => {
          throw new Error('must not mutate an existing User')
        },
      },
      order: {
        findFirst: async () => {
          throw new Error('must not resolve identity from Order.customerEmail')
        },
      },
    }

    const id = await createUsersService(prisma).findOrCreateCustomer({
      email: 'new@example.com',
      firstName: 'Peter',
      lastName: 'Novak',
    })
    assert.equal(id, 'email-customer')
  })

  it('does not attach a new phone to ADMIN when ADMIN.phone is a different number', async () => {
    const created = { id: 'new-customer' }
    const admin = {
      id: 'admin-id',
      phone: ADMIN_PHONE,
      role: Role.ADMIN,
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      patronymic: null,
    }
    const prisma = {
      user: {
        findUnique: async ({ where }: { where: { phone?: string; id?: string } }) => {
          if (where.phone === NEW_PHONE) return null
          if (where.phone === ADMIN_PHONE || where.id === 'admin-id') return admin
          return null
        },
        create: async () => created,
        update: async ({ where }: { where: { id: string } }) => {
          if (where.id === 'admin-id') {
            throw new Error('ADMIN.phone must stay unchanged')
          }
          return { id: where.id }
        },
      },
      order: {
        findFirst: async () => ({ userId: 'admin-id' }),
      },
    }

    const id = await createUsersService(prisma).findOrCreateCustomer({
      phone: NEW_PHONE,
      firstName: 'Peter',
      lastName: 'Novak',
    })
    assert.equal(id, 'new-customer')
  })
})
