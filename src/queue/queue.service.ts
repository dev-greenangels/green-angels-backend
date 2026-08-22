import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Queue } from 'bullmq'

import {
  APP_JOB_NAMES,
  APP_QUEUE,
  EXPIRE_UNPAID_CARD_ORDERS_EVERY_MS,
  EXPIRE_UNPAID_CARD_ORDERS_JOB_ID,
  type AppJobPayload,
  type OrderEmailJobType,
} from './queue.constants'

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name)

  constructor(@InjectQueue(APP_QUEUE) private readonly queue: Queue<AppJobPayload>) {}

  async onModuleInit() {
    await this.registerExpireUnpaidRepeatable()
  }

  private async registerExpireUnpaidRepeatable() {
    try {
      const existing = await this.queue.getRepeatableJobs()
      for (const job of existing) {
        if (
          job.id === EXPIRE_UNPAID_CARD_ORDERS_JOB_ID ||
          job.name === APP_JOB_NAMES.EXPIRE_UNPAID_CARD_ORDERS
        ) {
          await this.queue.removeRepeatableByKey(job.key)
        }
      }

      await this.queue.add(
        APP_JOB_NAMES.EXPIRE_UNPAID_CARD_ORDERS,
        { type: 'expire-unpaid-card-orders' },
        {
          jobId: EXPIRE_UNPAID_CARD_ORDERS_JOB_ID,
          repeat: { every: EXPIRE_UNPAID_CARD_ORDERS_EVERY_MS },
          removeOnComplete: 20,
          removeOnFail: 50,
        },
      )
      this.logger.log(
        `Scheduled ${APP_JOB_NAMES.EXPIRE_UNPAID_CARD_ORDERS} every ${EXPIRE_UNPAID_CARD_ORDERS_EVERY_MS / 1000}s`,
      )
    } catch (error) {
      this.logger.warn(
        `expire-unpaid repeatable register: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  async ping() {
    const job = await this.queue.add(APP_JOB_NAMES.PING, {
      type: 'ping',
      message: 'pong',
    })
    return { queued: true, jobId: job.id }
  }

  async enqueueOrderEmail(input: {
    orderId: string
    type: OrderEmailJobType
    delayMs?: number
  }) {
    const jobId =
      input.type === 'payment_reminder'
        ? `order-email-${input.type}-${input.orderId}`
        : `order-email-${input.type}-${input.orderId}-${Date.now()}`

    // Reminder uses stable jobId so create retries don't stack duplicates.
    if (input.type === 'payment_reminder') {
      try {
        const existing = await this.queue.getJob(jobId)
        if (existing) {
          const state = await existing.getState()
          if (state === 'completed' || state === 'failed') {
            await existing.remove().catch(() => undefined)
          } else {
            return existing
          }
        }
      } catch {
        // continue
      }
    }

    return this.queue.add(
      APP_JOB_NAMES.SEND_ORDER_EMAIL,
      {
        type: 'send-order-email',
        orderId: input.orderId,
        emailType: input.type,
      },
      {
        jobId,
        delay: input.delayMs && input.delayMs > 0 ? input.delayMs : undefined,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    )
  }
}
