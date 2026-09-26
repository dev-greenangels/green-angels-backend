import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import { PrismaService } from '../prisma/prisma.service'
import {
  CHECKOUT_DRAFT_PII_CLEANUP_BATCH_SIZE,
  checkoutDraftPiiRetentionCutoff,
} from './cart-pii-retention'

/**
 * Sanitizes expired checkoutDraft PII without deleting Cart / CartItems
 * and without reactivating carts via updatedAt bump.
 */
@Injectable()
export class CartPiiRetentionService {
  private readonly logger = new Logger(CartPiiRetentionService.name)

  constructor(private readonly prisma: PrismaService) {}

  async sanitizeExpiredCheckoutDrafts(
    batchSize = CHECKOUT_DRAFT_PII_CLEANUP_BATCH_SIZE,
  ): Promise<{ examined: number; sanitized: number }> {
    const take = Math.min(500, Math.max(1, Math.floor(batchSize)))
    const maxRounds = 50
    let examined = 0
    let sanitized = 0

    for (let round = 0; round < maxRounds; round++) {
      const batch = await this.sanitizeOneBatch(take)
      examined += batch.examined
      sanitized += batch.sanitized
      if (batch.examined < take) break
    }

    if (examined) {
      this.logger.log(
        `checkoutDraft PII cleanup finished: examined=${examined} sanitized=${sanitized}`,
      )
    }

    return { examined, sanitized }
  }

  private async sanitizeOneBatch(
    take: number,
  ): Promise<{ examined: number; sanitized: number }> {
    const cutoff = checkoutDraftPiiRetentionCutoff()

    const rows = await this.prisma.cart.findMany({
      where: {
        checkoutDraft: { not: Prisma.DbNull },
        updatedAt: { lt: cutoff },
      },
      select: { id: true, updatedAt: true },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take,
    })

    let sanitized = 0
    for (const row of rows) {
      try {
        // Explicitly preserve updatedAt so abandonment clock is unchanged.
        await this.prisma.cart.update({
          where: { id: row.id },
          data: {
            checkoutDraft: Prisma.DbNull,
            checkoutStartedAt: null,
            updatedAt: row.updatedAt,
          },
        })
        sanitized += 1
      } catch (err) {
        this.logger.warn(
          `checkoutDraft PII cleanup failed for cart ${row.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }

    return { examined: rows.length, sanitized }
  }
}
