import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'

import {
  encodeYearlyOrderNumber,
  OrderNumberLimitExceededError,
  ORDER_NUMBER_YEARLY_SEQ_MAX,
} from './order-number'

type Tx = Prisma.TransactionClient

/**
 * Atomically allocates the next yearly `Order.orderNumber` inside an open transaction.
 * Uses INSERT … ON CONFLICT DO UPDATE so the first concurrent checkout of a new year
 * cannot double-insert; row lock serializes increments.
 */
@Injectable()
export class OrderNumberAllocator {
  private readonly logger = new Logger(OrderNumberAllocator.name)

  async allocateNext(tx: Tx, year: number): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ lastSeq: number }>>`
      INSERT INTO "OrderNumberCounter" ("year", "lastSeq")
      VALUES (${year}, 1)
      ON CONFLICT ("year") DO UPDATE
      SET "lastSeq" = "OrderNumberCounter"."lastSeq" + 1
      WHERE "OrderNumberCounter"."lastSeq" < ${ORDER_NUMBER_YEARLY_SEQ_MAX}
      RETURNING "lastSeq"
    `

    const lastSeq = rows[0]?.lastSeq
    if (lastSeq == null || !Number.isInteger(lastSeq) || lastSeq < 1) {
      this.logger.error(
        JSON.stringify({
          event: 'order_number_year_limit',
          year,
          maxSeq: ORDER_NUMBER_YEARLY_SEQ_MAX,
        }),
      )
      throw new OrderNumberLimitExceededError(year)
    }

    return encodeYearlyOrderNumber(year, lastSeq)
  }
}
