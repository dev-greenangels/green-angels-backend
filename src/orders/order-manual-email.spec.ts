import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'
import { randomUUID } from 'node:crypto'

import {
  CommunicationAudience,
  CommunicationSource,
  CommunicationStatus,
  CommunicationType,
  Prisma,
} from '@prisma/client'

import { OrderCommunicationService } from './order-communication.service'
import { manualCustomerEmailIdempotencyKey } from './order-communication.constants'

type CommRow = {
  id: string
  idempotencyKey: string
  status: CommunicationStatus
  audience: CommunicationAudience
  type: CommunicationType
  source: CommunicationSource
  toEmail: string | null
  orderDocumentId: string | null
  orderId: string
  userId: string | null
  locale: string | null
  createdByUserId: string | null
  provider: string | null
  providerMessageId: string | null
  subjectSnapshot: string | null
  bodySnapshot: string | null
  errorMessage: string | null
  sentAt: Date | null
  createdAt: Date
  updatedAt: Date
}

describe('OrderCommunicationService — manual email concurrency + recipient', () => {
  let communications: Map<string, CommRow>
  let byId: Map<string, string>
  let manualSendCount: number
  let lastManualTo: string | null
  let mailThrow: boolean
  let service: OrderCommunicationService
  let rowLock: Promise<void>
  let releaseRowLock: (() => void) | null

  const order = {
    id: 'ord-manual-1',
    orderNumber: 99,
    customerEmail: 'customer@example.com',
    userId: 'user-1',
    countrySiteCode: 'sk',
    locale: 'sk',
  }

  beforeEach(() => {
    communications = new Map()
    byId = new Map()
    manualSendCount = 0
    lastManualTo = null
    mailThrow = false
    rowLock = Promise.resolve()
    releaseRowLock = null

    const findByKey = (key: string) => communications.get(key) ?? null
    const findById = (id: string) => {
      const key = byId.get(id)
      return key ? communications.get(key) ?? null : null
    }
    const save = (row: CommRow) => {
      communications.set(row.idempotencyKey, row)
      byId.set(row.id, row.idempotencyKey)
      return row
    }

    const txApi = {
      communication: {
        findUnique: async ({
          where,
        }: {
          where: { idempotencyKey?: string; id?: string }
        }) => {
          if (where.idempotencyKey) return findByKey(where.idempotencyKey)
          if (where.id) return findById(where.id)
          return null
        },
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
          const row = findById(where.id)
          if (!row) throw new Error('not found')
          return row
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const key = String(data.idempotencyKey)
          if (communications.has(key)) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
              code: 'P2002',
              clientVersion: 'test',
            })
          }
          const row: CommRow = {
            id: randomUUID(),
            idempotencyKey: key,
            status: CommunicationStatus.PENDING,
            audience: data.audience as CommunicationAudience,
            type: data.type as CommunicationType,
            source: data.source as CommunicationSource,
            toEmail: (data.toEmail as string) ?? null,
            orderDocumentId: (data.orderDocumentId as string) ?? null,
            orderId: String(data.orderId),
            userId: (data.userId as string) ?? null,
            locale: (data.locale as string) ?? null,
            createdByUserId: (data.createdByUserId as string) ?? null,
            provider: (data.provider as string) ?? null,
            providerMessageId: null,
            subjectSnapshot: null,
            bodySnapshot: null,
            errorMessage: null,
            sentAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
          return save(row)
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string }
          data: Partial<CommRow>
        }) => {
          const existing = findById(where.id)
          if (!existing) throw new Error('missing')
          const next = { ...existing, ...data, updatedAt: new Date() }
          return save(next)
        },
      },
      $executeRaw: async () => {
        // Simulate SELECT … FOR UPDATE: queue until previous lock holder releases.
        const prev = rowLock
        let release!: () => void
        rowLock = new Promise<void>((r) => {
          release = r
        })
        await prev
        releaseRowLock = release
        return 1
      },
    }

    const prisma = {
      order: {
        findUnique: async () => order,
      },
      $transaction: async (
        fn: (tx: typeof txApi) => Promise<unknown>,
        _opts?: unknown,
      ) => {
        try {
          const result = await fn(txApi)
          releaseRowLock?.()
          releaseRowLock = null
          return result
        } catch (error) {
          releaseRowLock?.()
          releaseRowLock = null
          throw error
        }
      },
    }

    const mail = {
      sendManualCustomerEmail: async (input: { to: string }) => {
        // Hold the row lock across a microtask so concurrent callers queue on FOR UPDATE.
        await new Promise((r) => setTimeout(r, 20))
        if (mailThrow) throw new Error('manual send failed')
        manualSendCount += 1
        lastManualTo = input.to
        return {
          id: `resend-manual-${manualSendCount}`,
          subject: 'manual',
          text: 'body',
        }
      },
    }

    const documents = {
      ensureConfirmationPdf: async () => {
        throw new Error('PDF not expected in this test')
      },
    }

    service = new OrderCommunicationService(
      prisma as never,
      documents as never,
      mail as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      { sign: () => 'tok' } as never,
    )
  })

  it('concurrent same idempotencyKey → exactly 1 Resend send', async () => {
    const key = 'nonce-concurrent-001'
    const payload = {
      orderId: order.id,
      subject: 'Hello',
      body: 'World message',
      idempotencyKey: key,
      createdByUserId: 'staff-1',
    }

    const [a, b] = await Promise.all([
      service.sendManualCustomerEmail(payload),
      service.sendManualCustomerEmail(payload),
    ])

    assert.equal(manualSendCount, 1)
    assert.equal(a.status, CommunicationStatus.SENT)
    assert.equal(b.status, CommunicationStatus.SENT)
    assert.equal(a.id, b.id)
    assert.equal(communications.size, 1)
    assert.equal(
      communications.get(manualCustomerEmailIdempotencyKey(order.id, key))?.toEmail,
      'customer@example.com',
    )
  })

  it('FAILED → later retry → exactly one additional send', async () => {
    const key = 'nonce-retry-failed-01'
    const payload = {
      orderId: order.id,
      subject: 'Hello',
      body: 'World message',
      idempotencyKey: key,
      createdByUserId: 'staff-1',
    }

    mailThrow = true
    await assert.rejects(() => service.sendManualCustomerEmail(payload), /manual send failed|надіслати/)
    assert.equal(manualSendCount, 0)
    assert.equal(
      communications.get(manualCustomerEmailIdempotencyKey(order.id, key))?.status,
      CommunicationStatus.FAILED,
    )

    mailThrow = false
    const ok = await service.sendManualCustomerEmail(payload)
    assert.equal(manualSendCount, 1)
    assert.equal(ok.status, CommunicationStatus.SENT)

    await service.sendManualCustomerEmail(payload)
    assert.equal(manualSendCount, 1, 'SENT retry must not resend')
  })

  it('ignores client toEmail — recipient is Order customer email only', async () => {
    const key = 'nonce-recipient-sec-01'
    // Type-level: toEmail is not on the public input. Runtime abuse via cast must still be ignored.
    const result = await service.sendManualCustomerEmail({
      orderId: order.id,
      subject: 'Hello',
      body: 'World message',
      idempotencyKey: key,
      createdByUserId: 'staff-1',
      ...( { toEmail: 'attacker@evil.test' } as object),
    } as Parameters<OrderCommunicationService['sendManualCustomerEmail']>[0])

    assert.equal(lastManualTo, 'customer@example.com')
    assert.equal(result.toEmail, 'customer@example.com')
    assert.notEqual(result.toEmail, 'attacker@evil.test')
  })
})
