import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  CommunicationAudience,
  CommunicationSource,
  CommunicationStatus,
  CommunicationType,
  OrderDocumentKind,
  Prisma,
  type Communication,
} from '@prisma/client'

import { FlexiService } from '../flexi/flexi.service'
import { FlexiSettingsService } from '../flexi/flexi.settings.service'
import { resolveShopPublicOrigin } from '../mail/country-hosts'
import { MailService } from '../mail/mail.service'
import { ONLINE_CARD_PAYMENT_METHOD } from '../payments/payments.constants'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../settings/settings.service'
import {
  customerAwaitingPaymentIdempotencyKey,
  customerCancelledUnpaidIdempotencyKey,
  customerLatePayRefundIdempotencyKey,
  customerPaymentReminderIdempotencyKey,
  managerCancelledUnpaidIdempotencyKey,
  managerLatePayRefundIdempotencyKey,
  managerOrderReadyIdempotencyKey,
  manualCustomerEmailIdempotencyKey,
  orderConfirmationPdfIdempotencyKey,
} from './order-communication.constants'
import { OrderConfirmationTokenService } from './order-confirmation-token.service'
import { OrderDocumentService } from './order-document.service'

type ClaimResult =
  | { action: 'skip'; reason: 'sent' | 'skipped' }
  | { action: 'send'; row: Communication }

export type CommunicationListItem = {
  id: string
  orderId: string | null
  orderNumber: string | null
  audience: CommunicationAudience
  type: CommunicationType
  source: CommunicationSource
  status: CommunicationStatus
  toEmail: string | null
  subjectSnapshot: string | null
  bodySnapshot: string | null
  locale: string | null
  createdByUserId: string | null
  hasAttachment: boolean
  errorMessage: string | null
  providerMessageId: string | null
  sentAt: string | null
  createdAt: string
}

const ORDER_COMM_PAGE_SIZE_MAX = 50

@Injectable()
export class OrderCommunicationService {
  private readonly logger = new Logger(OrderCommunicationService.name)

  /** Exposed for tests — counts PDF ensure calls when spied. */
  pdfEnsureCalls = 0

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: OrderDocumentService,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly flexi: FlexiService,
    private readonly flexiSettings: FlexiSettingsService,
    private readonly config: ConfigService,
    private readonly confirmationTokens: OrderConfirmationTokenService,
  ) {}

  /**
   * Orchestrator for customer confirmation + manager MANAGER_ORDER_READY.
   * Ensures PDF once; both emails share the same OrderDocument + Buffer.
   */
  async processOrderConfirmationBundle(orderId: string): Promise<void> {
    const order = await this.loadOrderForConfirmation(orderId)
    if (!order) return

    if (
      order.paymentMethod === ONLINE_CARD_PAYMENT_METHOD &&
      order.paymentStatus !== 'success'
    ) {
      return
    }

    const [needCustomer, needManager] = await Promise.all([
      this.shouldSendCustomerConfirmation(order),
      this.shouldSendManagerReady(),
    ])
    if (!needCustomer && !needManager) return

    this.pdfEnsureCalls += 1
    const { document, buffer } = await this.documents.ensureConfirmationPdf(orderId)
    const orderNumber = this.formatOrderNumber(order.orderNumber)
    const siteCode = this.normalizeSiteCode(order.countrySiteCode)
    const market = await this.settings.getMarketSettings()
    const itemSummary = this.buildItemSummary(order.items)

    const outcomes: Array<'sent' | 'skipped' | 'failed'> = []

    if (needCustomer) {
      outcomes.push(
        await this.sendCustomerConfirmation({
          order,
          orderNumber,
          siteCode,
          region: market.region,
          buffer,
          documentId: document.id,
        }),
      )
    }

    if (needManager) {
      outcomes.push(
        await this.sendManagerOrderReady({
          order,
          orderNumber,
          siteCode,
          buffer,
          documentId: document.id,
          filename: document.filename,
          itemSummary,
        }),
      )
    }

    // Independent branches: SENT/SKIPPED must not block the other, but any FAILED
    // keeps the BullMQ job retryable without resending already-SENT branches.
    if (outcomes.includes('failed')) {
      throw new Error(
        `Order confirmation bundle incomplete for ${orderId} (customer/manager branch FAILED)`,
      )
    }
  }

  async processAwaitingPayment(orderId: string): Promise<void> {
    await this.processCustomerLifecycleEmail({
      orderId,
      type: CommunicationType.CUSTOMER_AWAITING_PAYMENT,
      idempotencyKey: customerAwaitingPaymentIdempotencyKey(orderId),
      stampField: 'awaitingPaymentEmailSentAt',
      requireStatus: 'AWAITING_PAYMENT',
      requireUnpaid: true,
      send: (ctx) =>
        this.mail.sendAwaitingPaymentEmail({
          to: ctx.to,
          orderNumber: ctx.orderNumber,
          resumeUrl: ctx.resumeUrl,
          locale: ctx.locale,
          countrySiteCode: ctx.siteCode,
        }),
    })
  }

  async processPaymentReminder(orderId: string): Promise<void> {
    await this.processCustomerLifecycleEmail({
      orderId,
      type: CommunicationType.CUSTOMER_PAYMENT_REMINDER,
      idempotencyKey: customerPaymentReminderIdempotencyKey(orderId),
      stampField: 'paymentReminderEmailSentAt',
      requireStatus: 'AWAITING_PAYMENT',
      requireUnpaid: true,
      send: (ctx) =>
        this.mail.sendPaymentReminderEmail({
          to: ctx.to,
          orderNumber: ctx.orderNumber,
          resumeUrl: ctx.resumeUrl,
          locale: ctx.locale,
          countrySiteCode: ctx.siteCode,
        }),
    })
  }

  async processCancelledUnpaid(orderId: string): Promise<void> {
    await this.processCustomerLifecycleEmail({
      orderId,
      type: CommunicationType.CUSTOMER_CANCELLED_UNPAID,
      idempotencyKey: customerCancelledUnpaidIdempotencyKey(orderId),
      stampField: 'cancelledUnpaidEmailSentAt',
      requireStatus: 'CANCELLED',
      requireUnpaid: false,
      send: (ctx) =>
        this.mail.sendCancelledUnpaidEmail({
          to: ctx.to,
          orderNumber: ctx.orderNumber,
          shopUrl: ctx.shopUrl,
          locale: ctx.locale,
          countrySiteCode: ctx.siteCode,
        }),
    })
  }

  async processLatePayRefund(orderId: string): Promise<void> {
    await this.processCustomerLifecycleEmail({
      orderId,
      type: CommunicationType.CUSTOMER_LATE_PAY_REFUND,
      idempotencyKey: customerLatePayRefundIdempotencyKey(orderId),
      stampField: 'latePayRefundEmailSentAt',
      requireStatus: null,
      requireUnpaid: false,
      send: (ctx) =>
        this.mail.sendLatePayRefundEmail({
          to: ctx.to,
          orderNumber: ctx.orderNumber,
          shopUrl: ctx.shopUrl,
          locale: ctx.locale,
          countrySiteCode: ctx.siteCode,
        }),
    })
  }

  async processManagerCancelledUnpaid(orderId: string): Promise<void> {
    const cart = await this.settings.getCartCheckoutSettings()
    if (!cart.newOrderNotifyEmailEnabled) return
    const to = cart.newOrderNotifyEmail.trim()
    if (!to) return

    const claim = await this.claim({
      orderId,
      audience: CommunicationAudience.STAFF,
      type: CommunicationType.MANAGER_ORDER_CANCELLED_UNPAID,
      idempotencyKey: managerCancelledUnpaidIdempotencyKey(orderId),
      toEmail: to,
    })
    if (claim.action === 'skip') return

    const order = await this.loadOrderForStaff(orderId)
    if (!order || order.status !== 'CANCELLED') {
      await this.markSkipped(claim.row.id, 'order not cancelled')
      return
    }

    try {
      const result = await this.mail.sendManagerCancelledUnpaidEmail({
        to,
        countrySiteCode: this.normalizeSiteCode(order.countrySiteCode),
        order: {
          orderId: order.id,
          orderNumber: this.formatOrderNumber(order.orderNumber),
          createdAt: order.createdAt,
          cancelledAt: order.cancelledAt,
          totalAmount: Number(order.totalAmount),
          currency: order.currency,
          paymentMethod: order.paymentMethod,
          deliveryMethod: order.deliveryMethod,
          deliveryCountryCode: order.deliveryCountryCode,
          countrySiteCode: order.countrySiteCode,
          customerFirstName: order.customerFirstName,
          customerLastName: order.customerLastName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          itemCount: order.items.length,
          itemSummary: this.buildItemSummary(order.items),
        },
      })
      await this.markSent(claim.row.id, result)
    } catch (error) {
      await this.markFailed(claim.row.id, error)
      throw error
    }
  }

  async processManagerLatePayRefund(orderId: string): Promise<void> {
    const cart = await this.settings.getCartCheckoutSettings()
    if (!cart.newOrderNotifyEmailEnabled) return
    const to = cart.newOrderNotifyEmail.trim()
    if (!to) return

    const claim = await this.claim({
      orderId,
      audience: CommunicationAudience.STAFF,
      type: CommunicationType.MANAGER_LATE_PAY_REFUND,
      idempotencyKey: managerLatePayRefundIdempotencyKey(orderId),
      toEmail: to,
    })
    if (claim.action === 'skip') return

    const order = await this.loadOrderForStaff(orderId)
    if (!order) {
      await this.markSkipped(claim.row.id, 'order missing')
      return
    }

    try {
      const result = await this.mail.sendManagerLatePayRefundEmail({
        to,
        countrySiteCode: this.normalizeSiteCode(order.countrySiteCode),
        order: {
          orderId: order.id,
          orderNumber: this.formatOrderNumber(order.orderNumber),
          createdAt: order.createdAt,
          cancelledAt: order.cancelledAt,
          totalAmount: Number(order.totalAmount),
          currency: order.currency,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          customerFirstName: order.customerFirstName,
          customerLastName: order.customerLastName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          countrySiteCode: order.countrySiteCode,
        },
      })
      await this.markSent(claim.row.id, result)
    } catch (error) {
      await this.markFailed(claim.row.id, error)
      throw error
    }
  }

  async listForOrder(orderId: string): Promise<CommunicationListItem[]> {
    const rows = await this.prisma.communication.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      take: ORDER_COMM_PAGE_SIZE_MAX,
      select: this.listSelect(),
    })
    return rows.map((row) => this.mapListItem(row))
  }

  async listForUser(
    userId: string,
    opts?: { page?: number; pageSize?: number },
  ): Promise<{
    items: CommunicationListItem[]
    total: number
    page: number
    pageSize: number
    totalPages: number
  }> {
    const page = Math.max(1, opts?.page ?? 1)
    const pageSize = Math.min(
      ORDER_COMM_PAGE_SIZE_MAX,
      Math.max(1, opts?.pageSize ?? 20),
    )
    const where: Prisma.CommunicationWhereInput = {
      OR: [{ userId }, { order: { userId } }],
    }
    const [total, rows] = await Promise.all([
      this.prisma.communication.count({ where }),
      this.prisma.communication.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          ...this.listSelect(),
          order: { select: { orderNumber: true } },
        },
      }),
    ])
    return {
      items: rows.map((row) =>
        this.mapListItem({
          ...row,
          orderNumber: row.order?.orderNumber ?? null,
        }),
      ),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  }

  async confirmationPdfPresent(orderId: string): Promise<boolean> {
    const doc = await this.prisma.orderDocument.findUnique({
      where: {
        orderId_kind: { orderId, kind: OrderDocumentKind.CONFIRMATION_PDF },
      },
      select: { id: true },
    })
    return Boolean(doc)
  }

  async sendManualCustomerEmail(input: {
    orderId: string
    subject: string
    body: string
    attachConfirmationPdf?: boolean
    idempotencyKey: string
    createdByUserId: string
  }): Promise<CommunicationListItem> {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        orderNumber: true,
        customerEmail: true,
        userId: true,
        countrySiteCode: true,
        locale: true,
      },
    })
    if (!order) {
      throw new NotFoundException('Замовлення не знайдено.')
    }

    // Recipient is always the Order customer email — never client-controlled.
    const to = (order.customerEmail?.trim() || '').toLowerCase()
    if (!to || !to.includes('@')) {
      throw new BadRequestException('Немає валідного email одержувача.')
    }

    const subject = input.subject.trim()
    const body = input.body.trim()
    if (!subject || !body) {
      throw new BadRequestException('Тема та текст листа обовʼязкові.')
    }
    if (subject.length > 200 || body.length > 10_000) {
      throw new BadRequestException('Тема або текст занадто довгі.')
    }

    const nonce = input.idempotencyKey.trim()
    if (nonce.length < 8 || nonce.length > 80) {
      throw new BadRequestException('Некоректний idempotencyKey.')
    }

    const idempotencyKey = manualCustomerEmailIdempotencyKey(order.id, nonce)

    // Prepare PDF outside the claim lock (ensureConfirmationPdf is itself idempotent).
    let pdf: Buffer | null = null
    let documentId: string | null = null
    let pdfFilename: string | null = null
    if (input.attachConfirmationPdf) {
      try {
        const ensured = await this.documents.ensureConfirmationPdf(order.id)
        pdf = ensured.buffer
        documentId = ensured.document.id
        pdfFilename = ensured.document.filename
      } catch (error) {
        throw new ServiceUnavailableException(
          'Не вдалося підготувати PDF підтвердження.',
        )
      }
    }

    /**
     * Atomic claim: row lock (SELECT FOR UPDATE) until send completes or fails.
     * Concurrent same-key requests wait, then see SENT and skip Resend.
     * ZERO schema change — PostgreSQL row lock only.
     */
    return this.prisma.$transaction(
      async (tx) => {
        let row = await tx.communication.findUnique({
          where: { idempotencyKey },
        })
        if (!row) {
          try {
            row = await tx.communication.create({
              data: {
                orderId: order.id,
                userId: order.userId ?? null,
                audience: CommunicationAudience.CUSTOMER,
                type: CommunicationType.MANUAL_CUSTOMER_EMAIL,
                source: CommunicationSource.MANUAL,
                status: CommunicationStatus.PENDING,
                idempotencyKey,
                toEmail: to,
                locale: order.locale ?? null,
                orderDocumentId: documentId,
                createdByUserId: input.createdByUserId,
                provider: 'resend',
              },
            })
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            ) {
              row = await tx.communication.findUnique({ where: { idempotencyKey } })
              if (!row) throw error
            } else {
              throw error
            }
          }
        }

        await tx.$executeRaw`
          SELECT 1 FROM "Communication" WHERE id = ${row.id} FOR UPDATE
        `

        row = await tx.communication.findUniqueOrThrow({
          where: { id: row.id },
        })

        if (
          row.status === CommunicationStatus.SENT ||
          row.status === CommunicationStatus.SKIPPED
        ) {
          return this.mapListItem({
            ...row,
            orderNumber: order.orderNumber,
          })
        }

        if (documentId && row.orderDocumentId !== documentId) {
          await tx.communication.update({
            where: { id: row.id },
            data: { orderDocumentId: documentId },
          })
        }

        try {
          const result = await this.mail.sendManualCustomerEmail({
            to,
            subject,
            body,
            countrySiteCode: this.normalizeSiteCode(order.countrySiteCode),
            pdf,
            pdfFilename,
          })
          const updated = await tx.communication.update({
            where: { id: row.id },
            data: {
              status: CommunicationStatus.SENT,
              providerMessageId: result.id,
              subjectSnapshot: result.subject,
              bodySnapshot: result.text,
              sentAt: new Date(),
              errorMessage: null,
              toEmail: to,
            },
          })
          return this.mapListItem({
            ...updated,
            orderNumber: order.orderNumber,
          })
        } catch (error) {
          await tx.communication.update({
            where: { id: row.id },
            data: {
              status: CommunicationStatus.FAILED,
              errorMessage: error instanceof Error ? error.message : String(error),
            },
          })
          throw new ServiceUnavailableException(
            error instanceof Error ? error.message : 'Не вдалося надіслати лист.',
          )
        }
      },
      { maxWait: 10_000, timeout: 60_000 },
    )
  }

  private async processCustomerLifecycleEmail(input: {
    orderId: string
    type: CommunicationType
    idempotencyKey: string
    stampField:
      | 'awaitingPaymentEmailSentAt'
      | 'paymentReminderEmailSentAt'
      | 'cancelledUnpaidEmailSentAt'
      | 'latePayRefundEmailSentAt'
    requireStatus: string | null
    requireUnpaid: boolean
    send: (ctx: {
      to: string
      orderNumber: string
      resumeUrl: string
      shopUrl: string
      locale: string | null
      siteCode: 'sk' | 'hu' | 'at' | null
    }) => Promise<{ id: string | null; subject: string; text: string }>
  }): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        customerEmail: true,
        countrySiteCode: true,
        locale: true,
        userId: true,
        awaitingPaymentEmailSentAt: true,
        paymentReminderEmailSentAt: true,
        cancelledUnpaidEmailSentAt: true,
        latePayRefundEmailSentAt: true,
      },
    })
    if (!order) return

    const stamp = order[input.stampField]
    if (stamp) return

    const to = order.customerEmail?.trim()
    if (!to) return

    if (input.requireStatus && order.status !== input.requireStatus) return
    if (input.requireUnpaid && order.paymentStatus === 'success') return

    const claim = await this.claim({
      orderId: order.id,
      userId: order.userId,
      audience: CommunicationAudience.CUSTOMER,
      type: input.type,
      idempotencyKey: input.idempotencyKey,
      toEmail: to,
      locale: order.locale,
    })
    if (claim.action === 'skip') {
      if (claim.reason === 'sent') {
        await this.prisma.order.updateMany({
          where: { id: order.id, [input.stampField]: null },
          data: { [input.stampField]: new Date() },
        })
      }
      return
    }

    const orderNumber = this.formatOrderNumber(order.orderNumber)
    const siteCode = this.normalizeSiteCode(order.countrySiteCode)
    const shopOrigin = this.resolveShopOrigin(siteCode)
    const localeSegment = this.normalizeLocaleSegment(order.locale, siteCode)
    const confirmationToken = this.confirmationTokens.sign(orderNumber)
    const resumeUrl = this.buildResumeUrl(
      shopOrigin,
      localeSegment,
      orderNumber,
      confirmationToken,
    )
    const shopUrl = localeSegment ? `${shopOrigin}/${localeSegment}` : shopOrigin

    try {
      const result = await input.send({
        to,
        orderNumber,
        resumeUrl,
        shopUrl,
        locale: order.locale,
        siteCode,
      })
      if (!result.id && !this.mail.isConfigured()) {
        await this.markSkipped(claim.row.id, 'resend not configured')
        return
      }
      await this.markSent(claim.row.id, result)
      await this.prisma.order.updateMany({
        where: { id: order.id, [input.stampField]: null },
        data: { [input.stampField]: new Date() },
      })
    } catch (error) {
      await this.markFailed(claim.row.id, error)
      throw error
    }
  }

  private async sendCustomerConfirmation(input: {
    order: NonNullable<Awaited<ReturnType<OrderCommunicationService['loadOrderForConfirmation']>>>
    orderNumber: string
    siteCode: 'sk' | 'hu' | 'at' | null
    region: 'ua' | 'sk'
    buffer: Buffer
    documentId: string
  }): Promise<'sent' | 'skipped' | 'failed'> {
    const to = input.order.customerEmail?.trim()
    if (!to) return 'skipped'

    const claim = await this.claim({
      orderId: input.order.id,
      userId: input.order.userId,
      audience: CommunicationAudience.CUSTOMER,
      type: CommunicationType.ORDER_CONFIRMATION_PDF,
      idempotencyKey: orderConfirmationPdfIdempotencyKey(input.order.id),
      toEmail: to,
      locale: input.order.locale,
      orderDocumentId: input.documentId,
    })
    if (claim.action === 'skip') {
      return claim.reason === 'sent' ? 'sent' : 'skipped'
    }

    try {
      const result = await this.mail.sendOrderConfirmationEmail({
        to,
        orderNumber: input.orderNumber,
        pdf: input.buffer,
        locale: input.order.locale ?? undefined,
        region: input.region,
        countrySiteCode: input.siteCode,
        codFeeAmount:
          input.order.codFeeAmount != null ? Number(input.order.codFeeAmount) : null,
        currency: input.order.currency,
      })
      if (!result.id && !this.mail.isConfigured()) {
        await this.markSkipped(claim.row.id, 'resend not configured')
        return 'skipped'
      }
      await this.markSent(claim.row.id, result)
      return 'sent'
    } catch (error) {
      await this.markFailed(claim.row.id, error)
      this.logger.warn(
        `Customer confirmation failed for ${input.order.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return 'failed'
    }
  }

  private async sendManagerOrderReady(input: {
    order: NonNullable<Awaited<ReturnType<OrderCommunicationService['loadOrderForConfirmation']>>>
    orderNumber: string
    siteCode: 'sk' | 'hu' | 'at' | null
    buffer: Buffer
    documentId: string
    filename: string
    itemSummary: string[]
  }): Promise<'sent' | 'skipped' | 'failed'> {
    const cart = await this.settings.getCartCheckoutSettings()
    const to = cart.newOrderNotifyEmail.trim()
    if (!to) return 'skipped'

    const claim = await this.claim({
      orderId: input.order.id,
      userId: input.order.userId,
      audience: CommunicationAudience.STAFF,
      type: CommunicationType.MANAGER_ORDER_READY,
      idempotencyKey: managerOrderReadyIdempotencyKey(input.order.id),
      toEmail: to,
      orderDocumentId: input.documentId,
    })
    if (claim.action === 'skip') {
      return claim.reason === 'sent' ? 'sent' : 'skipped'
    }

    try {
      const result = await this.mail.sendNewOrderManagerEmail({
        to,
        countrySiteCode: input.siteCode,
        pdf: input.buffer,
        pdfFilename: input.filename,
        order: {
          orderId: input.order.id,
          orderNumber: input.orderNumber,
          createdAt: input.order.createdAt,
          totalAmount: Number(input.order.totalAmount),
          productsSubtotal: Number(input.order.productsSubtotal ?? input.order.totalAmount),
          deliveryAmount: Number(input.order.deliveryAmount ?? 0),
          taxAmount: Number(input.order.taxAmount ?? 0),
          currency: input.order.currency,
          paymentMethod: input.order.paymentMethod,
          paymentStatus: input.order.paymentStatus,
          deliveryMethod: input.order.deliveryMethod,
          deliveryCountryCode: input.order.deliveryCountryCode,
          countrySiteCode: input.order.countrySiteCode,
          customerFirstName: input.order.customerFirstName,
          customerLastName: input.order.customerLastName,
          customerEmail: input.order.customerEmail,
          customerPhone: input.order.customerPhone,
          itemCount: input.order.items.length,
          itemSummary: input.itemSummary,
          erpSyncStatus: input.order.erpSyncStatus,
        },
      })
      await this.markSent(claim.row.id, result)
      return 'sent'
    } catch (error) {
      await this.markFailed(claim.row.id, error)
      this.logger.warn(
        `Manager order-ready failed for ${input.order.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return 'failed'
    }
  }

  private async shouldSendCustomerConfirmation(order: {
    customerEmail: string | null
    companyIco: string | null
    companyVatId: string | null
  }): Promise<boolean> {
    if (!order.customerEmail?.trim()) return false
    const cart = await this.settings.getCartCheckoutSettings()
    if (cart.orderPdfEmailEnabled === false) return false

    if (await this.flexi.isConfigured()) {
      const flexiCfg = await this.flexiSettings.getSettings()
      const isB2b = Boolean(order.companyIco?.trim() || order.companyVatId?.trim())
      const mode = this.flexi.resolveDocumentSendMode(isB2b, flexiCfg.documentSend)
      if (!this.flexi.shouldSendSiteDocument(mode)) return false
    }
    return true
  }

  private async shouldSendManagerReady(): Promise<boolean> {
    const cart = await this.settings.getCartCheckoutSettings()
    return Boolean(cart.newOrderNotifyEmailEnabled && cart.newOrderNotifyEmail.trim())
  }

  private async claim(input: {
    orderId: string
    userId?: string | null
    audience: CommunicationAudience
    type: CommunicationType
    source?: CommunicationSource
    idempotencyKey: string
    toEmail: string
    locale?: string | null
    orderDocumentId?: string | null
    createdByUserId?: string | null
  }): Promise<ClaimResult> {
    const existing = await this.prisma.communication.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    })
    if (existing) {
      if (
        existing.status === CommunicationStatus.SENT ||
        existing.status === CommunicationStatus.SKIPPED
      ) {
        return { action: 'skip', reason: existing.status === 'SENT' ? 'sent' : 'skipped' }
      }
      return { action: 'send', row: existing }
    }

    try {
      const row = await this.prisma.communication.create({
        data: {
          orderId: input.orderId,
          userId: input.userId ?? null,
          audience: input.audience,
          type: input.type,
          source: input.source ?? CommunicationSource.AUTOMATIC,
          status: CommunicationStatus.PENDING,
          idempotencyKey: input.idempotencyKey,
          toEmail: input.toEmail,
          locale: input.locale ?? null,
          orderDocumentId: input.orderDocumentId ?? null,
          createdByUserId: input.createdByUserId ?? null,
          provider: 'resend',
        },
      })
      return { action: 'send', row }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.communication.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        })
        if (!raced) throw error
        if (
          raced.status === CommunicationStatus.SENT ||
          raced.status === CommunicationStatus.SKIPPED
        ) {
          return { action: 'skip', reason: raced.status === 'SENT' ? 'sent' : 'skipped' }
        }
        return { action: 'send', row: raced }
      }
      throw error
    }
  }

  private async markSent(
    id: string,
    result: { id: string | null; subject?: string | null; text?: string | null },
  ) {
    await this.prisma.communication.update({
      where: { id },
      data: {
        status: CommunicationStatus.SENT,
        providerMessageId: result.id,
        subjectSnapshot: result.subject ?? undefined,
        bodySnapshot: result.text ?? undefined,
        sentAt: new Date(),
        errorMessage: null,
      },
    })
  }

  private async markFailed(id: string, error: unknown) {
    await this.prisma.communication.update({
      where: { id },
      data: {
        status: CommunicationStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    })
  }

  private async markSkipped(id: string, reason: string) {
    await this.prisma.communication.update({
      where: { id },
      data: {
        status: CommunicationStatus.SKIPPED,
        errorMessage: reason,
      },
    })
  }

  private listSelect() {
    return {
      id: true,
      orderId: true,
      audience: true,
      type: true,
      source: true,
      status: true,
      toEmail: true,
      subjectSnapshot: true,
      bodySnapshot: true,
      locale: true,
      createdByUserId: true,
      orderDocumentId: true,
      errorMessage: true,
      providerMessageId: true,
      sentAt: true,
      createdAt: true,
    } as const
  }

  private mapListItem(row: {
    id: string
    orderId: string | null
    audience: CommunicationAudience
    type: CommunicationType
    source: CommunicationSource
    status: CommunicationStatus
    toEmail: string | null
    subjectSnapshot: string | null
    bodySnapshot: string | null
    locale: string | null
    createdByUserId: string | null
    orderDocumentId: string | null
    errorMessage: string | null
    providerMessageId: string | null
    sentAt: Date | null
    createdAt: Date
    orderNumber?: number | null
  }): CommunicationListItem {
    return {
      id: row.id,
      orderId: row.orderId,
      orderNumber:
        row.orderNumber != null ? this.formatOrderNumber(row.orderNumber) : null,
      audience: row.audience,
      type: row.type,
      source: row.source,
      status: row.status,
      toEmail: row.toEmail,
      subjectSnapshot: row.subjectSnapshot,
      bodySnapshot: row.bodySnapshot,
      locale: row.locale,
      createdByUserId: row.createdByUserId,
      hasAttachment: Boolean(row.orderDocumentId),
      errorMessage:
        row.status === CommunicationStatus.FAILED ||
        row.status === CommunicationStatus.SKIPPED
          ? row.errorMessage
          : null,
      providerMessageId: row.providerMessageId,
      sentAt: row.sentAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }
  }

  private async loadOrderForConfirmation(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        customerEmail: true,
        customerFirstName: true,
        customerLastName: true,
        customerPhone: true,
        countrySiteCode: true,
        deliveryCountryCode: true,
        deliveryMethod: true,
        companyIco: true,
        companyVatId: true,
        locale: true,
        codFeeAmount: true,
        currency: true,
        totalAmount: true,
        productsSubtotal: true,
        deliveryAmount: true,
        taxAmount: true,
        erpSyncStatus: true,
        userId: true,
        items: {
          select: {
            productName: true,
            latinName: true,
            variantLabel: true,
            quantity: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    })
  }

  private async loadOrderForStaff(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        cancelledAt: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
        customerEmail: true,
        customerFirstName: true,
        customerLastName: true,
        customerPhone: true,
        countrySiteCode: true,
        deliveryCountryCode: true,
        deliveryMethod: true,
        currency: true,
        totalAmount: true,
        items: {
          select: {
            productName: true,
            latinName: true,
            variantLabel: true,
            quantity: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    })
  }

  private buildItemSummary(
    items: Array<{
      productName: string
      latinName: string | null
      variantLabel: string | null
      quantity: number
    }>,
  ): string[] {
    return items.map((item) => {
      const parts = [item.productName]
      if (item.latinName?.trim()) parts.push(item.latinName.trim())
      if (item.variantLabel?.trim()) parts.push(item.variantLabel.trim())
      return `• ${parts.join(' / ')} × ${item.quantity}`
    })
  }

  private formatOrderNumber(orderNumber: number): string {
    return `ZY-${String(orderNumber).padStart(8, '0')}`
  }

  private normalizeSiteCode(
    countrySiteCode: string | null | undefined,
  ): 'sk' | 'hu' | 'at' | null {
    if (
      countrySiteCode === 'sk' ||
      countrySiteCode === 'hu' ||
      countrySiteCode === 'at'
    ) {
      return countrySiteCode
    }
    return null
  }

  private resolveShopOrigin(countrySiteCode: 'sk' | 'hu' | 'at' | null): string {
    return resolveShopPublicOrigin({
      countrySiteCode,
      countryHostsEnv: this.config.get<string>('GA_COUNTRY_HOSTS'),
      shopPublicUrl: this.config.get<string>('SHOP_PUBLIC_URL'),
      corsOrigin: this.config.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
    })
  }

  private normalizeLocaleSegment(
    locale: string | null | undefined,
    countrySiteCode: 'sk' | 'hu' | 'at' | null,
  ): string {
    const allowed = new Set(['uk', 'en', 'sk', 'hu', 'de', 'cs'])
    const raw = (locale ?? '').trim().toLowerCase()
    if (raw && allowed.has(raw)) return raw
    if (countrySiteCode === 'at') return 'de'
    if (countrySiteCode === 'hu') return 'hu'
    if (countrySiteCode === 'sk') return 'sk'
    return 'uk'
  }

  private buildResumeUrl(
    shopOrigin: string,
    localeSegment: string,
    orderNumber: string,
    confirmationToken: string,
  ): string {
    const base = shopOrigin.replace(/\/$/, '')
    const loc = localeSegment.trim()
    const prefix = loc ? `${base}/${loc}` : base
    return `${prefix}/checkout/pay?order=${encodeURIComponent(orderNumber)}&confirmation=${encodeURIComponent(confirmationToken)}`
  }
}
