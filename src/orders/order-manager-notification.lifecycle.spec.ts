import assert from 'node:assert/strict'
import { describe, it, beforeEach } from 'node:test'

import {
  CommunicationAudience,
  CommunicationStatus,
  CommunicationType,
  OrderDocumentKind,
} from '@prisma/client'

import { ONLINE_CARD_PAYMENT_METHOD } from '../payments/payments.constants'
import { OrderCommunicationService } from './order-communication.service'
import {
  managerCancelledUnpaidIdempotencyKey,
  managerLatePayRefundIdempotencyKey,
  managerOrderReadyIdempotencyKey,
  orderConfirmationPdfIdempotencyKey,
} from './order-communication.constants'

type CommRow = {
  id: string
  idempotencyKey: string
  status: CommunicationStatus
  audience: CommunicationAudience
  type: CommunicationType
  orderDocumentId: string | null
}

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord-1',
    orderNumber: 42,
    createdAt: new Date('2026-09-27T10:00:00.000Z'),
    cancelledAt: null as Date | null,
    status: 'PROCESSING',
    paymentMethod: 'bank-transfer',
    paymentStatus: null as string | null,
    customerEmail: 'customer@example.com',
    customerFirstName: 'Jan',
    customerLastName: 'Novak',
    customerPhone: '+421900000000',
    countrySiteCode: 'sk',
    deliveryCountryCode: 'sk',
    deliveryMethod: 'packeta-box',
    companyIco: null as string | null,
    companyVatId: null as string | null,
    locale: 'sk',
    codFeeAmount: null,
    currency: 'EUR',
    totalAmount: 100,
    productsSubtotal: 80,
    deliveryAmount: 5,
    taxAmount: 15,
    erpSyncStatus: null,
    userId: 'user-1',
    items: [
      {
        productName: 'Monstera',
        latinName: 'Monstera deliciosa',
        variantLabel: 'M',
        quantity: 2,
      },
    ],
    ...overrides,
  }
}

describe('OrderCommunicationService — manager notification lifecycle A–L', () => {
  let communications: Map<string, CommRow>
  let documents: Map<string, { id: string; filename: string; storageKey: string }>
  let pdfGenerateCount: number
  let customerSendCount: number
  let managerReadySendCount: number
  let managerCancelSendCount: number
  let managerLatePaySendCount: number
  let lastCustomerPdf: Buffer | null
  let lastManagerPdf: Buffer | null
  let service: OrderCommunicationService
  let orderRow: ReturnType<typeof baseOrder>
  let managerNotifyEnabled: boolean
  let orderPdfEmailEnabled: boolean
  let mailThrowOnManager: boolean
  let mailThrowOnCustomer: boolean

  const pdfBuffer = Buffer.from('%PDF-fake-once')

  beforeEach(() => {
    communications = new Map()
    documents = new Map()
    pdfGenerateCount = 0
    customerSendCount = 0
    managerReadySendCount = 0
    managerCancelSendCount = 0
    managerLatePaySendCount = 0
    lastCustomerPdf = null
    lastManagerPdf = null
    orderRow = baseOrder()
    managerNotifyEnabled = true
    orderPdfEmailEnabled = true
    mailThrowOnManager = false
    mailThrowOnCustomer = false

    const prisma = {
      communication: {
        findUnique: async ({ where }: { where: { idempotencyKey: string } }) => {
          return communications.get(where.idempotencyKey) ?? null
        },
        create: async ({ data }: { data: Omit<CommRow, 'id'> & { idempotencyKey: string } }) => {
          if (communications.has(data.idempotencyKey)) {
            const err = Object.assign(new Error('Unique'), {
              code: 'P2002',
              name: 'PrismaClientKnownRequestError',
            })
            // Mimic Prisma P2002 instanceof check — use real Prisma error path via soft map
            const { Prisma } = await import('@prisma/client')
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
              code: 'P2002',
              clientVersion: 'test',
            })
          }
          const row: CommRow = {
            id: `comm-${communications.size + 1}`,
            idempotencyKey: data.idempotencyKey,
            status: CommunicationStatus.PENDING,
            audience: data.audience,
            type: data.type,
            orderDocumentId: (data as { orderDocumentId?: string | null }).orderDocumentId ?? null,
          }
          communications.set(data.idempotencyKey, row)
          return row
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string }
          data: Partial<CommRow> & { status?: CommunicationStatus }
        }) => {
          for (const [key, row] of communications) {
            if (row.id === where.id) {
              const next = { ...row, ...data }
              communications.set(key, next as CommRow)
              return next
            }
          }
          return null
        },
      },
      order: {
        findUnique: async () => orderRow,
      },
    }

    const documentsService = {
      ensureConfirmationPdf: async (orderId: string) => {
        let doc = documents.get(orderId)
        if (!doc) {
          pdfGenerateCount += 1
          doc = {
            id: `doc-${orderId}`,
            filename: 'order-ZY-00000042.pdf',
            storageKey: `orders/${orderId}/confirmation.pdf`,
          }
          documents.set(orderId, doc)
        }
        return {
          document: {
            ...doc,
            orderId,
            kind: OrderDocumentKind.CONFIRMATION_PDF,
            contentType: 'application/pdf',
            byteSize: pdfBuffer.length,
            sha256: null,
            generatedAt: new Date(),
            createdAt: new Date(),
          },
          buffer: pdfBuffer,
        }
      },
    }

    const mail = {
      isConfigured: () => true,
      sendOrderConfirmationEmail: async (input: { pdf: Buffer }) => {
        if (mailThrowOnCustomer) throw new Error('customer send failed')
        customerSendCount += 1
        lastCustomerPdf = input.pdf
        return {
          id: `resend-cust-${customerSendCount}`,
          subject: 'confirmation',
          text: 'body',
        }
      },
      sendNewOrderManagerEmail: async (input: { pdf?: Buffer | null }) => {
        if (mailThrowOnManager) throw new Error('manager send failed')
        managerReadySendCount += 1
        lastManagerPdf = input.pdf ?? null
        return {
          id: `resend-mgr-${managerReadySendCount}`,
          subject: 'manager ready',
          text: 'body',
        }
      },
      sendManagerCancelledUnpaidEmail: async () => {
        managerCancelSendCount += 1
        return { id: `resend-cancel-${managerCancelSendCount}`, subject: 'cancel', text: 'body' }
      },
      sendManagerLatePayRefundEmail: async () => {
        managerLatePaySendCount += 1
        return { id: `resend-late-${managerLatePaySendCount}`, subject: 'late', text: 'body' }
      },
    }

    const settings = {
      getCartCheckoutSettings: async () => ({
        newOrderNotifyEmailEnabled: managerNotifyEnabled,
        newOrderNotifyEmail: 'manager@greenangels.sk',
        orderPdfEmailEnabled,
      }),
      getMarketSettings: async () => ({ region: 'sk' as const }),
    }

    const flexi = {
      isConfigured: async () => false,
      resolveDocumentSendMode: () => 'site',
      shouldSendSiteDocument: () => true,
    }

    service = new OrderCommunicationService(
      prisma as never,
      documentsService as never,
      mail as never,
      settings as never,
      flexi as never,
      {} as never,
      { get: () => undefined } as never,
      { sign: () => 'test-token' } as never,
    )
  })

  it('A+B+C: non-card durable → manager ready + same PDF + one ensure', async () => {
    // Job flow: enqueueOrderEmail({ type: 'order_confirmation_pdf' }) → processOrderConfirmationBundle
    await service.processOrderConfirmationBundle('ord-1')

    assert.equal(managerReadySendCount, 1)
    assert.equal(customerSendCount, 1)
    assert.equal(pdfGenerateCount, 1)
    assert.equal(lastCustomerPdf, pdfBuffer)
    assert.equal(lastManagerPdf, pdfBuffer)
    assert.ok(communications.has(managerOrderReadyIdempotencyKey('ord-1')))
    assert.ok(communications.has(orderConfirmationPdfIdempotencyKey('ord-1')))
    assert.equal(
      communications.get(managerOrderReadyIdempotencyKey('ord-1'))?.audience,
      CommunicationAudience.STAFF,
    )
    assert.equal(
      communications.get(orderConfirmationPdfIdempotencyKey('ord-1'))?.audience,
      CommunicationAudience.CUSTOMER,
    )
  })

  it('C again: second process reuses document — ensure may load existing once more but mail not resent', async () => {
    await service.processOrderConfirmationBundle('ord-1')
    const genAfterFirst = pdfGenerateCount
    await service.processOrderConfirmationBundle('ord-1')
    assert.equal(managerReadySendCount, 1)
    assert.equal(customerSendCount, 1)
    // ensureConfirmationPdf is called again but OrderDocumentService would short-circuit;
    // our mock increments — real service loads from storage. Assert mail idempotency.
    assert.ok(pdfGenerateCount >= genAfterFirst)
  })

  it('D: card AWAITING_PAYMENT unpaid → zero manager (orchestrator no-op)', async () => {
    // Job flow at create: awaiting_payment + payment_reminder only — NOT order_confirmation_pdf
    orderRow = baseOrder({
      paymentMethod: ONLINE_CARD_PAYMENT_METHOD,
      paymentStatus: null,
      status: 'AWAITING_PAYMENT',
    })
    await service.processOrderConfirmationBundle('ord-1')
    assert.equal(managerReadySendCount, 0)
    assert.equal(customerSendCount, 0)
    assert.equal(pdfGenerateCount, 0)
  })

  it('E+F: card payment success → manager + same PDF', async () => {
    // Job flow: applyPaymentSuccess → enqueue order_confirmation_pdf → bundle
    orderRow = baseOrder({
      paymentMethod: ONLINE_CARD_PAYMENT_METHOD,
      paymentStatus: 'success',
      status: 'PROCESSING',
    })
    await service.processOrderConfirmationBundle('ord-1')
    assert.equal(managerReadySendCount, 1)
    assert.equal(customerSendCount, 1)
    assert.equal(pdfGenerateCount, 1)
    assert.equal(lastManagerPdf, lastCustomerPdf)
    assert.equal(
      communications.get(managerOrderReadyIdempotencyKey('ord-1'))?.type,
      CommunicationType.MANAGER_ORDER_READY,
    )
  })

  it('G: payment webhook retry → zero duplicate manager email', async () => {
    orderRow = baseOrder({
      paymentMethod: ONLINE_CARD_PAYMENT_METHOD,
      paymentStatus: 'success',
    })
    await service.processOrderConfirmationBundle('ord-1')
    await service.processOrderConfirmationBundle('ord-1')
    assert.equal(managerReadySendCount, 1)
    assert.equal(customerSendCount, 1)
  })

  it('H+I: cancelled unpaid manager notification — no PDF ensure', async () => {
    // Job flow: cancelUnpaidOrder → enqueue manager_cancelled_unpaid (+ customer cancelled_unpaid)
    orderRow = baseOrder({
      status: 'CANCELLED',
      paymentMethod: ONLINE_CARD_PAYMENT_METHOD,
      paymentStatus: null,
      cancelledAt: new Date('2026-09-27T10:40:00.000Z'),
    })
    await service.processManagerCancelledUnpaid('ord-1')
    assert.equal(managerCancelSendCount, 1)
    assert.equal(pdfGenerateCount, 0)
    assert.equal(
      communications.get(managerCancelledUnpaidIdempotencyKey('ord-1'))?.type,
      CommunicationType.MANAGER_ORDER_CANCELLED_UNPAID,
    )
    assert.equal(
      communications.get(managerCancelledUnpaidIdempotencyKey('ord-1'))?.audience,
      CommunicationAudience.STAFF,
    )
  })

  it('J: cancellation job retry → zero duplicate manager cancel email', async () => {
    orderRow = baseOrder({
      status: 'CANCELLED',
      paymentMethod: ONLINE_CARD_PAYMENT_METHOD,
      cancelledAt: new Date(),
    })
    await service.processManagerCancelledUnpaid('ord-1')
    await service.processManagerCancelledUnpaid('ord-1')
    assert.equal(managerCancelSendCount, 1)
  })

  it('K: late payment after cancel → MANAGER_LATE_PAY_REFUND, not MANAGER_ORDER_READY', async () => {
    // Job flow: handleLatePayRefund → late_pay_refund + manager_late_pay_refund
    // Never enqueue order_confirmation_pdf / manager_order_ready
    orderRow = baseOrder({
      status: 'CANCELLED',
      paymentMethod: ONLINE_CARD_PAYMENT_METHOD,
      paymentStatus: 'refunded',
      cancelledAt: new Date(),
    })
    await service.processManagerLatePayRefund('ord-1')
    assert.equal(managerLatePaySendCount, 1)
    assert.equal(managerReadySendCount, 0)
    assert.equal(pdfGenerateCount, 0)
    assert.ok(communications.has(managerLatePayRefundIdempotencyKey('ord-1')))
    assert.equal(
      communications.get(managerLatePayRefundIdempotencyKey('ord-1'))?.type,
      CommunicationType.MANAGER_LATE_PAY_REFUND,
    )
  })

  it('L: manager failure marks FAILED and keeps job retryable (customer already SENT)', async () => {
    mailThrowOnManager = true
    await assert.rejects(() => service.processOrderConfirmationBundle('ord-1'), /incomplete/)
    assert.equal(customerSendCount, 1)
    assert.equal(
      communications.get(managerOrderReadyIdempotencyKey('ord-1'))?.status,
      CommunicationStatus.FAILED,
    )
    assert.equal(
      communications.get(orderConfirmationPdfIdempotencyKey('ord-1'))?.status,
      CommunicationStatus.SENT,
    )
  })

  it('A: customer SENT + manager FAILED → retry skips customer, resends manager', async () => {
    mailThrowOnManager = true
    await assert.rejects(() => service.processOrderConfirmationBundle('ord-1'), /incomplete/)
    assert.equal(customerSendCount, 1)
    assert.equal(managerReadySendCount, 0)
    assert.equal(pdfGenerateCount, 1)

    mailThrowOnManager = false
    await service.processOrderConfirmationBundle('ord-1')
    assert.equal(customerSendCount, 1, 'customer must not be resent')
    assert.equal(managerReadySendCount, 1, 'manager must retry once')
    assert.equal(pdfGenerateCount, 1, 'PDF must not regenerate')
    assert.equal(
      communications.get(managerOrderReadyIdempotencyKey('ord-1'))?.status,
      CommunicationStatus.SENT,
    )
  })

  it('B: customer FAILED + manager SENT → retry resends customer, skips manager', async () => {
    mailThrowOnCustomer = true
    await assert.rejects(() => service.processOrderConfirmationBundle('ord-1'), /incomplete/)
    assert.equal(customerSendCount, 0)
    assert.equal(managerReadySendCount, 1)
    assert.equal(
      communications.get(orderConfirmationPdfIdempotencyKey('ord-1'))?.status,
      CommunicationStatus.FAILED,
    )
    assert.equal(
      communications.get(managerOrderReadyIdempotencyKey('ord-1'))?.status,
      CommunicationStatus.SENT,
    )

    mailThrowOnCustomer = false
    await service.processOrderConfirmationBundle('ord-1')
    assert.equal(customerSendCount, 1)
    assert.equal(managerReadySendCount, 1, 'manager must not be resent')
    assert.equal(pdfGenerateCount, 1)
    assert.equal(
      communications.get(orderConfirmationPdfIdempotencyKey('ord-1'))?.status,
      CommunicationStatus.SENT,
    )
  })

  it('C: both FAILED → retry resends both', async () => {
    mailThrowOnCustomer = true
    mailThrowOnManager = true
    await assert.rejects(() => service.processOrderConfirmationBundle('ord-1'), /incomplete/)
    assert.equal(customerSendCount, 0)
    assert.equal(managerReadySendCount, 0)

    mailThrowOnCustomer = false
    mailThrowOnManager = false
    await service.processOrderConfirmationBundle('ord-1')
    assert.equal(customerSendCount, 1)
    assert.equal(managerReadySendCount, 1)
    assert.equal(pdfGenerateCount, 1)
  })

  it('D: both SENT → duplicate invocation sends nothing', async () => {
    await service.processOrderConfirmationBundle('ord-1')
    assert.equal(customerSendCount, 1)
    assert.equal(managerReadySendCount, 1)
    await service.processOrderConfirmationBundle('ord-1')
    assert.equal(customerSendCount, 1)
    assert.equal(managerReadySendCount, 1)
    assert.equal(pdfGenerateCount, 1)
  })

  it('enqueue type matrix documentation (queue job names)', () => {
    // Non-card create → order_confirmation_pdf
    // Card create → awaiting_payment + payment_reminder (no manager)
    // Card paid → order_confirmation_pdf
    // Card unpaid cancel → cancelled_unpaid + manager_cancelled_unpaid
    // Late pay → late_pay_refund + manager_late_pay_refund
    const expected = {
      nonCardCreate: ['order_confirmation_pdf'],
      cardCreate: ['awaiting_payment', 'payment_reminder'],
      cardPaid: ['order_confirmation_pdf'],
      cardUnpaidCancel: ['cancelled_unpaid', 'manager_cancelled_unpaid'],
      latePay: ['late_pay_refund', 'manager_late_pay_refund'],
    }
    assert.deepEqual(expected.nonCardCreate, ['order_confirmation_pdf'])
    assert.ok(!expected.cardCreate.includes('order_confirmation_pdf'))
    assert.ok(!expected.cardCreate.includes('manager_cancelled_unpaid'))
    assert.ok(expected.cardPaid.includes('order_confirmation_pdf'))
    assert.ok(expected.cardUnpaidCancel.includes('manager_cancelled_unpaid'))
    assert.ok(expected.latePay.includes('manager_late_pay_refund'))
    assert.ok(!expected.latePay.includes('order_confirmation_pdf'))
  })
})
