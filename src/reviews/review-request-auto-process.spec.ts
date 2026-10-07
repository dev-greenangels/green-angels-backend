/**
 * Phase 4 hardening — per-attempt Communication rows (FAILED never → SENT).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CommunicationSource, CommunicationStatus, CommunicationType } from '@prisma/client'
import { ServiceUnavailableException } from '@nestjs/common'

import {
  bullMqAttemptNumber,
  customerReviewRequestAutoAttemptIdempotencyKey,
  customerReviewRequestIdempotencyKey,
} from '../orders/order-communication.constants'
import { ReviewRequestService } from './review-request.service'

function reviewsSettings(overrides: Record<string, unknown> = {}) {
  return {
    postPurchaseRequestsEnabled: true,
    automaticSendingEnabled: true,
    trigger: 'SHIPPED_PLUS_DELAY',
    delayDays: 7,
    tokenValidityDays: 90,
    requestEmailTemplates: {
      sk: { subject: 'Review {{orderNumber}}', body: 'Hi {{customerName}} {{reviewUrl}}' },
    },
    ...overrides,
  }
}

function buildProcessHarness(opts: {
  order?: Record<string, unknown> | null
  reviewRequest?: Record<string, unknown> | null
  successfulComm?: boolean
  mailFail?: boolean
  settings?: Record<string, unknown>
}) {
  const order =
    opts.order === null
      ? null
      : {
          id: 'order-1',
          orderNumber: 1,
          status: 'SHIPPED',
          paymentStatus: 'cod',
          customerEmail: 'jan@example.com',
          locale: 'sk',
          countrySiteCode: 'sk',
          customerFirstName: 'Ján',
          customerLastName: 'Novák',
          userId: null,
          ...(opts.order ?? {}),
        }

  let requestRow =
    opts.reviewRequest === undefined
      ? null
      : opts.reviewRequest === null
        ? null
        : {
            id: 'rr-1',
            orderId: 'order-1',
            sentAt: null as Date | null,
            completedAt: null as Date | null,
            revokedAt: null as Date | null,
            expiresAt: new Date(Date.now() + 86_400_000),
            locale: 'sk',
            tokenHash: 'a'.repeat(64),
            ...(opts.reviewRequest ?? {}),
          }

  const events: unknown[] = []
  const communications: Array<Record<string, unknown>> = []
  let mailCalls = 0
  const enqueueCalls: unknown[] = []
  const bodySnapshotsAtCreate: string[] = []

  const prisma = {
    order: {
      findUnique: async () => order,
    },
    reviewRequest: {
      findUnique: async () => requestRow,
      create: async (args: { data: Record<string, unknown> }) => {
        requestRow = {
          id: 'rr-new',
          orderId: 'order-1',
          sentAt: null,
          completedAt: null,
          revokedAt: null,
          expiresAt: args.data.expiresAt as Date,
          locale: args.data.locale as string,
          tokenHash: args.data.tokenHash as string,
          ...args.data,
        }
        return requestRow
      },
      update: async (args: {
        where: { id?: string; orderId?: string }
        data: Record<string, unknown>
      }) => {
        requestRow = { ...(requestRow as object), ...args.data } as typeof requestRow
        return requestRow
      },
    },
    reviewRequestEvent: {
      create: async (args: { data: unknown }) => {
        events.push(args.data)
        return args.data
      },
    },
    communication: {
      findFirst: async (args?: {
        where?: { status?: CommunicationStatus; type?: CommunicationType }
      }) => {
        if (args?.where?.status === CommunicationStatus.SENT || opts.successfulComm) {
          const sent = communications.find((c) => c.status === CommunicationStatus.SENT)
          if (sent) return { id: sent.id }
          if (opts.successfulComm) return { id: 'c-sent' }
        }
        if (args?.where?.status === CommunicationStatus.FAILED) {
          const failed = [...communications]
            .filter((c) => c.status === CommunicationStatus.FAILED)
            .sort(
              (a, b) =>
                (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime(),
            )
          return failed[0] ?? null
        }
        return null
      },
      findUnique: async (args: { where: { idempotencyKey?: string; id?: string } }) => {
        if (args.where.idempotencyKey) {
          return communications.find((c) => c.idempotencyKey === args.where.idempotencyKey) ?? null
        }
        if (args.where.id) {
          return communications.find((c) => c.id === args.where.id) ?? null
        }
        return null
      },
      findUniqueOrThrow: async (args: { where: { id: string } }) => {
        const row = communications.find((c) => c.id === args.where.id)
        if (!row) throw new Error('missing')
        return row
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const row = {
          id: `c-${communications.length + 1}`,
          createdAt: new Date(Date.now() + communications.length),
          providerMessageId: null,
          errorMessage: null,
          sentAt: null,
          ...args.data,
        }
        bodySnapshotsAtCreate.push(String(args.data.bodySnapshot ?? ''))
        communications.push(row)
        return row
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = communications.findIndex((c) => c.id === args.where.id)
        const prev = { ...communications[idx] }
        // Detect illegal FAILED → SENT mutation for assertions helpers
        ;(communications[idx] as { __prevStatus?: unknown }).__prevStatus = prev.status
        communications[idx] = { ...communications[idx], ...args.data }
        return communications[idx]
      },
    },
    $executeRaw: async () => undefined,
    $transaction: async (
      fn: (tx: typeof prisma) => Promise<unknown>,
      _opts?: unknown,
    ) => fn(prisma),
  }

  const redis = { client: { incr: async () => 1, expire: async () => 1 } }
  const config = { get: (k: string) => (k === 'SHOP_PUBLIC_URL' ? 'https://shop.test' : undefined) }
  const settings = {
    getReviewsSettings: async () => reviewsSettings(opts.settings),
  }
  let failRemaining = opts.mailFail ? Number.POSITIVE_INFINITY : 0
  const mail = {
    sendCustomerReviewRequestEmail: async (input: { text: string }) => {
      mailCalls += 1
      if (failRemaining > 0) {
        failRemaining -= 1
        throw new Error('provider down')
      }
      return { id: `msg-${mailCalls}`, subject: 'Review ZY-00000001', text: input.text }
    },
  }
  const queue = {
    enqueueCustomerReviewRequest: async (input: unknown) => {
      enqueueCalls.push(input)
      return { id: 'job-1' }
    },
  }

  const service = new ReviewRequestService(
    prisma as never,
    redis as never,
    config as never,
    settings as never,
    mail as never,
    queue as never,
  )

  return {
    service,
    events,
    communications,
    bodySnapshotsAtCreate,
    get mailCalls() {
      return mailCalls
    },
    setFailRemaining(n: number) {
      failRemaining = n
    },
    enqueueCalls,
    getRequest: () => requestRow,
    snapshotOf: (id: string) => {
      const row = communications.find((c) => c.id === id)
      return row
        ? {
            status: row.status,
            bodySnapshot: row.bodySnapshot,
            subjectSnapshot: row.subjectSnapshot,
            errorMessage: row.errorMessage,
          }
        : null
    },
  }
}

describe('bullMqAttemptNumber', () => {
  it('maps attemptsMade 0/1/2 → attempt 1/2/3', () => {
    assert.equal(bullMqAttemptNumber(0), 1)
    assert.equal(bullMqAttemptNumber(1), 2)
    assert.equal(bullMqAttemptNumber(2), 3)
    assert.equal(
      customerReviewRequestAutoAttemptIdempotencyKey('o1', 2),
      'order:o1:customer_review_request:auto:attempt:2',
    )
  })
})

describe('ReviewRequestService.processAutomaticSend — per-attempt Communication', () => {
  it('1–3. fail, fail, success → three rows; FAILED unchanged; sentAt on success', async () => {
    const h = buildProcessHarness({})
    h.setFailRemaining(2)

    await assert.rejects(
      () => h.service.processAutomaticSend('order-1', { attempt: 1 }),
      ServiceUnavailableException,
    )
    assert.equal(h.communications.length, 1)
    assert.equal(h.communications[0].status, CommunicationStatus.FAILED)
    assert.equal(
      h.communications[0].idempotencyKey,
      customerReviewRequestAutoAttemptIdempotencyKey('order-1', 1),
    )
    const snap1 = structuredClone(h.snapshotOf('c-1')!)
    assert.match(String(snap1.bodySnapshot), /https:\/\/shop\.test\/sk\/reviews\/request\//)

    await assert.rejects(
      () => h.service.processAutomaticSend('order-1', { attempt: 2 }),
      ServiceUnavailableException,
    )
    assert.equal(h.communications.length, 2)
    assert.equal(h.communications[0].status, CommunicationStatus.FAILED)
    assert.deepEqual(h.snapshotOf('c-1'), snap1)
    assert.equal(h.communications[1].status, CommunicationStatus.FAILED)
    assert.equal(
      h.communications[1].idempotencyKey,
      customerReviewRequestAutoAttemptIdempotencyKey('order-1', 2),
    )
    // Auto-send reuses a stable encrypted token when present — body URLs may match.
    const snap2 = structuredClone(h.snapshotOf('c-2')!)

    const result = await h.service.processAutomaticSend('order-1', { attempt: 3 })
    assert.equal(result.outcome, 'sent')
    assert.equal(h.communications.length, 3)
    assert.deepEqual(h.snapshotOf('c-1'), snap1)
    assert.deepEqual(h.snapshotOf('c-2'), snap2)
    assert.equal(h.communications[2].status, CommunicationStatus.SENT)
    assert.equal(
      h.communications[2].idempotencyKey,
      customerReviewRequestAutoAttemptIdempotencyKey('order-1', 3),
    )
    assert.ok(h.getRequest()?.sentAt)
    assert.equal(h.mailCalls, 3)
  })

  it('4/5. after success, duplicate execution → no fourth email / no second SENT', async () => {
    const h = buildProcessHarness({})
    await h.service.processAutomaticSend('order-1', { attempt: 1 })
    assert.equal(h.communications.filter((c) => c.status === CommunicationStatus.SENT).length, 1)
    const mailBefore = h.mailCalls
    const result = await h.service.processAutomaticSend('order-1', { attempt: 2 })
    assert.equal(result.outcome, 'skip_already_sent')
    assert.equal(h.mailCalls, mailBefore)
    assert.equal(h.communications.filter((c) => c.status === CommunicationStatus.SENT).length, 1)
  })

  it('7. previous FAILED snapshots never mutate on later success', async () => {
    const h = buildProcessHarness({})
    h.setFailRemaining(1)
    await assert.rejects(
      () => h.service.processAutomaticSend('order-1', { attempt: 1 }),
      ServiceUnavailableException,
    )
    const frozen = structuredClone(h.snapshotOf('c-1')!)
    await h.service.processAutomaticSend('order-1', { attempt: 2 })
    assert.deepEqual(h.snapshotOf('c-1'), frozen)
    assert.equal(h.communications[0].status, CommunicationStatus.FAILED)
  })

  it('same attempt key after FAILED does not mutate row to SENT', async () => {
    const h = buildProcessHarness({})
    h.setFailRemaining(1)
    await assert.rejects(
      () => h.service.processAutomaticSend('order-1', { attempt: 1 }),
      ServiceUnavailableException,
    )
    const frozen = structuredClone(h.snapshotOf('c-1')!)
    h.setFailRemaining(0)
    await assert.rejects(
      () => h.service.processAutomaticSend('order-1', { attempt: 1 }),
      ServiceUnavailableException,
    )
    assert.deepEqual(h.snapshotOf('c-1'), frozen)
    assert.equal(h.communications.length, 1)
  })
})

describe('ReviewRequestService.sendEmailForOrder — manual attempts', () => {
  it('6. manual failed then retry with new nonce → separate Communication rows', async () => {
    const h = buildProcessHarness({
      reviewRequest: {
        id: 'rr-1',
        sentAt: null,
        completedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        locale: 'sk',
        tokenHash: 'b'.repeat(64),
      },
      settings: { automaticSendingEnabled: false },
    })
    // order.findUnique for send needs reviewRequest nested
    const orderWithRr = {
      id: 'order-1',
      orderNumber: 1,
      status: 'SHIPPED',
      paymentStatus: 'cod',
      customerEmail: 'jan@example.com',
      locale: 'sk',
      countrySiteCode: 'sk',
      customerFirstName: 'Ján',
      customerLastName: 'Novák',
      userId: null,
      reviewRequest: {
        id: 'rr-1',
        locale: 'sk',
        sentAt: null,
        revokedAt: null,
        completedAt: null,
        expiresAt: new Date(Date.now() + 86_400_000),
        tokenEncrypted: null,
      },
    }
    ;(h.service as unknown as { prisma: { order: { findUnique: () => Promise<unknown> } } }).prisma.order.findUnique =
      async () => orderWithRr

    h.setFailRemaining(1)
    await assert.rejects(
      () =>
        h.service.sendEmailForOrder('order-1', 'staff-1', {
          confirmRegenerate: true,
          idempotencyKey: 'manual-nonce-1',
        }),
      ServiceUnavailableException,
    )
    assert.equal(h.communications.length, 1)
    assert.equal(h.communications[0].status, CommunicationStatus.FAILED)
    assert.equal(
      h.communications[0].idempotencyKey,
      customerReviewRequestIdempotencyKey('order-1', 'manual-nonce-1'),
    )
    const snap1 = structuredClone(h.snapshotOf('c-1')!)

    h.setFailRemaining(0)
    const ok = await h.service.sendEmailForOrder('order-1', 'staff-1', {
      confirmRegenerate: true,
      idempotencyKey: 'manual-nonce-2',
    })
    assert.equal(ok.communication.status, CommunicationStatus.SENT)
    assert.equal(h.communications.length, 2)
    assert.deepEqual(h.snapshotOf('c-1'), snap1)
    assert.equal(h.communications[1].source, CommunicationSource.MANUAL)
    assert.equal(
      h.communications[1].idempotencyKey,
      customerReviewRequestIdempotencyKey('order-1', 'manual-nonce-2'),
    )
  })
})

describe('Communication snapshot access', () => {
  it('8. review-request public controller has no Communication routes', async () => {
    const fs = await import('node:fs/promises')
    const path = new URL('../reviews/reviews.controller.ts', import.meta.url)
    const src = await fs.readFile(path, 'utf8')
    assert.equal(/communications/i.test(src), false)
    assert.match(src, /BackstageJwtAuthGuard/)
  })
})
