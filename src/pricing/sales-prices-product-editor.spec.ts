/**
 * Authorization + batch listing for Product Editor sales prices.
 * Uses mocked Prisma / Permissions — no DB.
 *
 * Policy (Stage 6A): catalog.view|edit staff may see ALL/GROUP/COMPANY —
 * aligned with Final Price Preview. Storefront buyers never hit this path.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { Role, SalesPriceScope } from '@prisma/client'

import { SalesPricesService } from './sales-prices.service'

function buildService(opts: {
  held: string[]
  role?: Role
  product?: { id: string; variants: Array<{ id: string }> } | null
  rows?: Array<Record<string, unknown>>
  total?: number
}) {
  const held = new Set(opts.held)
  const prisma = {
    user: {
      findUnique: async () => ({ role: opts.role ?? Role.MANAGER }),
    },
    userPermission: {
      count: async ({ where }: { where: { permission: { in: string[] } } }) =>
        where.permission.in.filter((p) => held.has(p)).length,
    },
    product: {
      findUnique: async () => opts.product ?? null,
    },
    productSalesPrice: {
      count: async () => opts.total ?? (opts.rows?.length ?? 0),
      findMany: async () => opts.rows ?? [],
    },
  }

  const permissions = {
    userHasAnyPermission: async (_id: string, required: string[]) => {
      if ((opts.role ?? Role.MANAGER) === Role.ADMIN) return true
      return required.some((p) => held.has(p))
    },
  }

  const settings = {
    getMarketSettings: async () => ({ priceSource: 'SALES_PRICES' }),
  }

  return new SalesPricesService(prisma as never, settings as never, permissions as never)
}

const sampleRow = {
  id: 'sp1',
  productVariantId: 'v1',
  scope: SalesPriceScope.ALL,
  priceGroupCode: null,
  flexiFirmaKod: null,
  currency: 'EUR',
  unitPrice: 10,
  validFrom: null,
  validTo: null,
  limMnoz2: 5,
  unitPrice2: 9,
  limMnoz3: 0,
  unitPrice3: null,
  limMnoz4: 0,
  unitPrice4: null,
  limMnoz5: 0,
  unitPrice5: null,
  syncedAt: new Date('2026-01-01'),
}

const companyRow = {
  ...sampleRow,
  id: 'sp2',
  scope: SalesPriceScope.COMPANY,
  flexiFirmaKod: 'FIRMA1',
  unitPrice: 8,
}

describe('SalesPricesService.listForProductEditor', () => {
  it('404 when product missing', async () => {
    const svc = buildService({ held: ['catalog.view'], product: null })
    await assert.rejects(
      () =>
        svc.listForProductEditor({
          actorUserId: 'm1',
          productId: 'missing',
        }),
      NotFoundException,
    )
  })

  it('catalog.view gets ALL/GROUP batch without COMPANY when includeCompany=false', async () => {
    const svc = buildService({
      held: ['catalog.view'],
      product: { id: 'p1', variants: [{ id: 'v1' }] },
      rows: [sampleRow],
      total: 1,
    })
    const result = await svc.listForProductEditor({
      actorUserId: 'm1',
      productId: 'p1',
      includeCompany: false,
    })
    assert.equal(result.items.length, 1)
    assert.equal(result.companyIncluded, false)
    assert.equal(result.companyDenied, false)
    assert.equal(result.items[0]?.unitPrice, 10)
    assert.equal(result.items[0]?.validityStatus, 'ACTIVE')
  })

  it('catalog.view may include COMPANY (aligned with variant-preview)', async () => {
    const svc = buildService({
      held: ['catalog.view'],
      product: { id: 'p1', variants: [{ id: 'v1' }] },
      rows: [sampleRow, companyRow],
      total: 2,
    })
    const result = await svc.listForProductEditor({
      actorUserId: 'm1',
      productId: 'p1',
      includeCompany: true,
    })
    assert.equal(result.companyIncluded, true)
    assert.equal(result.companyDenied, false)
    assert.equal(result.total, 2)
  })

  it('catalog.edit may request scope=COMPANY', async () => {
    const svc = buildService({
      held: ['catalog.edit'],
      rows: [companyRow],
      total: 1,
    })
    const result = await svc.listForProductEditor({
      actorUserId: 'm1',
      variantIds: ['v1'],
      scope: SalesPriceScope.COMPANY,
      includeCompany: false,
    })
    assert.equal(result.companyIncluded, true)
    assert.equal(result.companyDenied, false)
  })

  it('orders.view alone cannot force includeCompany', async () => {
    const svc = buildService({
      held: ['orders.view'],
      product: { id: 'p1', variants: [{ id: 'v1' }] },
    })
    await assert.rejects(
      () =>
        svc.listForProductEditor({
          actorUserId: 'm1',
          productId: 'p1',
          includeCompany: true,
        }),
      ForbiddenException,
    )
  })

  it('flexi.view may include COMPANY', async () => {
    const svc = buildService({
      held: ['flexi.view'],
      product: { id: 'p1', variants: [{ id: 'v1' }] },
      rows: [sampleRow, companyRow],
      total: 2,
    })
    const result = await svc.listForProductEditor({
      actorUserId: 'm1',
      productId: 'p1',
      includeCompany: true,
    })
    assert.equal(result.companyIncluded, true)
    assert.equal(result.companyDenied, false)
    assert.equal(result.total, 2)
  })

  it('ADMIN bypasses company gate', async () => {
    const svc = buildService({
      role: Role.ADMIN,
      held: [],
      product: { id: 'p1', variants: [{ id: 'v1' }] },
      rows: [sampleRow],
    })
    const result = await svc.listForProductEditor({
      actorUserId: 'admin',
      productId: 'p1',
      includeCompany: true,
    })
    assert.equal(result.companyIncluded, true)
  })
})

describe('Backstage preview ↔ sales-prices permission alignment', () => {
  it('variant-preview allows catalog.view OR promotions.manage', async () => {
    const { RolesGuard } = await import('../auth/guards/roles.guard')
    const { Reflector } = await import('@nestjs/core')
    const { ROLES_KEY } = await import('../auth/decorators/roles.decorator')
    const { REQUIRE_PERMISSIONS_KEY } = await import(
      '../auth/decorators/require-permissions.decorator'
    )

    const build = (held: string[]) => {
      const reflector = {
        getAllAndOverride: (key: string) => {
          if (key === ROLES_KEY) return [Role.ADMIN, Role.MANAGER]
          if (key === REQUIRE_PERMISSIONS_KEY) {
            return ['catalog.view', 'catalog.edit', 'promotions.manage']
          }
          return undefined
        },
      } as unknown as InstanceType<typeof Reflector>
      const prisma = {
        user: { findUnique: async () => ({ role: Role.MANAGER }) },
      }
      const permissions = {
        userHasAnyPermission: async (_id: string, required: string[]) =>
          required.some((p) => held.includes(p)),
      }
      return new RolesGuard(reflector, prisma as never, permissions as never)
    }

    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: 'm1' } }),
      }),
    } as never

    assert.equal(await build(['catalog.view']).canActivate(ctx), true)
    assert.equal(await build(['promotions.manage']).canActivate(ctx), true)
    await assert.rejects(() => build(['orders.view']).canActivate(ctx), Error)
  })

  it('catalog.view that can preview COMPANY can also list COMPANY sales prices', async () => {
    const svc = buildService({
      held: ['catalog.view'],
      rows: [companyRow],
      total: 1,
    })
    const listed = await svc.listForProductEditor({
      actorUserId: 'm1',
      variantIds: ['v1'],
      includeCompany: true,
    })
    assert.equal(listed.companyIncluded, true)
    assert.equal(listed.companyDenied, false)
  })
})
