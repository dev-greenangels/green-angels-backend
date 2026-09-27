import { createHash } from 'crypto'
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common'
import {
  OrderDocumentKind,
  Prisma,
  type OrderDocument,
} from '@prisma/client'

import { MediaStorageService } from '../media/media-storage.service'
import { orderConfirmationPdfKey } from '../media/media-keys'
import { PrismaService } from '../prisma/prisma.service'
import { OrdersService } from './orders.service'

export type EnsuredOrderDocument = {
  document: OrderDocument
  buffer: Buffer
}

@Injectable()
export class OrderDocumentService {
  private readonly logger = new Logger(OrderDocumentService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
  ) {}

  /**
   * Generate confirmation PDF at most once per Order, archive privately, return Buffer.
   * Concurrent callers race on @@unique([orderId, kind]) — loser reloads winner.
   */
  async ensureConfirmationPdf(orderId: string): Promise<EnsuredOrderDocument> {
    const existing = await this.prisma.orderDocument.findUnique({
      where: { orderId_kind: { orderId, kind: OrderDocumentKind.CONFIRMATION_PDF } },
    })
    if (existing) {
      const buffer = await this.loadOrRegenerate(existing, orderId)
      return { document: existing, buffer }
    }

    const buffer = await this.orders.buildOrderPdfById(orderId)
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true },
    })
    if (!order) {
      throw new Error(`Order ${orderId} missing during PDF archive`)
    }
    const filename = `order-ZY-${String(order.orderNumber).padStart(8, '0')}.pdf`
    const storageKey = orderConfirmationPdfKey(orderId)
    const sha256 = createHash('sha256').update(buffer).digest('hex')

    await this.storage.putPrivateObject({
      key: storageKey,
      body: buffer,
      contentType: 'application/pdf',
    })

    try {
      const document = await this.prisma.orderDocument.create({
        data: {
          orderId,
          kind: OrderDocumentKind.CONFIRMATION_PDF,
          storageKey,
          filename,
          contentType: 'application/pdf',
          byteSize: buffer.length,
          sha256,
        },
      })
      return { document, buffer }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.prisma.orderDocument.findUnique({
          where: { orderId_kind: { orderId, kind: OrderDocumentKind.CONFIRMATION_PDF } },
        })
        if (!winner) throw error
        const winnerBuffer = await this.loadOrRegenerate(winner, orderId)
        return { document: winner, buffer: winnerBuffer }
      }
      throw error
    }
  }

  private async loadOrRegenerate(
    document: OrderDocument,
    orderId: string,
  ): Promise<Buffer> {
    try {
      return await this.storage.getPrivateObject(document.storageKey)
    } catch (error) {
      this.logger.warn(
        `OrderDocument ${document.id} missing in private storage — regenerating: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      const buffer = await this.orders.buildOrderPdfById(orderId)
      const storageKey = orderConfirmationPdfKey(orderId)
      await this.storage.putPrivateObject({
        key: storageKey,
        body: buffer,
        contentType: 'application/pdf',
      })
      await this.prisma.orderDocument.update({
        where: { id: document.id },
        data: {
          storageKey,
          byteSize: buffer.length,
          sha256: createHash('sha256').update(buffer).digest('hex'),
          generatedAt: new Date(),
        },
      })
      return buffer
    }
  }
}
