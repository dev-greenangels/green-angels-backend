import { Injectable, Logger } from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'
import { FLEXI_ORDER_RECONCILE_FINAL_STATUSES } from './flexi.constants'
import { FlexiService } from './flexi.service'
import { FlexiOperationLogService } from './flexi-operation-log.service'
import { FlexiSyncLockService } from './flexi-sync-lock.service'

export type FlexiOrderReconcileResult = {
  ok: boolean
  checked: number
  updated: number
  skipped: number
  message: string
  errors: string[]
}

/**
 * Current-state reconcile for SITE orders exported to ABRA that are not final.
 * Does not scan all historical orders.
 */
@Injectable()
export class FlexiOrderReconcileService {
  private readonly logger = new Logger(FlexiOrderReconcileService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly flexi: FlexiService,
    private readonly lock: FlexiSyncLockService,
    private readonly ops: FlexiOperationLogService,
  ) {}

  async reconcileActiveErpOrders(opts?: {
    initiatedBy?: string
    logOperation?: boolean
    useLock?: boolean
  }): Promise<FlexiOrderReconcileResult> {
    const run = () => this.run(opts)
    if (opts?.useLock === false) {
      return run()
    }
    const owner = `order-reconcile:${opts?.initiatedBy ?? 'system'}:${Date.now()}`
    const locked = await this.lock.withLock(owner, run)
    if (!locked.ok) {
      return {
        ok: false,
        checked: 0,
        updated: 0,
        skipped: 0,
        message: locked.message,
        errors: [locked.message],
      }
    }
    return locked.result
  }

  private async run(opts?: {
    initiatedBy?: string
    logOperation?: boolean
  }): Promise<FlexiOrderReconcileResult> {
    const started = Date.now()
    const shouldLog = opts?.logOperation !== false
    const log = shouldLog
      ? await this.ops.start('ORDER_RECONCILE', { initiatedBy: opts?.initiatedBy })
      : null

    const finalStatuses = [...FLEXI_ORDER_RECONCILE_FINAL_STATUSES]
    const PAGE = 200
    const CAP = 5000
    let checked = 0
    let updated = 0
    let skipped = 0
    const errors: string[] = []
    let truncated = false

    for (let skip = 0; skip < CAP; skip += PAGE) {
      const orders = await this.prisma.order.findMany({
        where: {
          OR: [{ externalErpId: { not: null } }, { erpNativeId: { not: null } }],
          status: { notIn: finalStatuses },
          erpSyncStatus: { in: ['SYNCED', 'ERP_CONFLICT', 'RETRYING', 'PENDING_ERP'] },
        },
        select: {
          id: true,
          externalErpId: true,
          erpNativeId: true,
          status: true,
          trackingNumber: true,
        },
        orderBy: { createdAt: 'desc' },
        take: PAGE,
        skip,
      })
      if (orders.length === 0) break
      if (skip + orders.length >= CAP && orders.length === PAGE) {
        truncated = true
      }

      for (const order of orders) {
        const flexiRef = order.externalErpId?.trim() || order.erpNativeId?.trim()
        if (!flexiRef) {
          skipped += 1
          checked += 1
          continue
        }
        try {
          const before = await this.prisma.order.findUnique({
            where: { id: order.id },
            select: { status: true, trackingNumber: true, shippedAt: true },
          })
          await this.flexi.syncOrderFromFlexi(flexiRef)
          const after = await this.prisma.order.findUnique({
            where: { id: order.id },
            select: { status: true, trackingNumber: true, shippedAt: true },
          })
          checked += 1
          if (
            before &&
            after &&
            (before.status !== after.status ||
              before.trackingNumber !== after.trackingNumber ||
              before.shippedAt?.getTime() !== after.shippedAt?.getTime())
          ) {
            updated += 1
          } else {
            skipped += 1
          }
        } catch (error) {
          checked += 1
          const message = error instanceof Error ? error.message : String(error)
          errors.push(`${order.id}: ${message}`)
          this.logger.warn(`order reconcile ${order.id}: ${message}`)
        }
      }

      if (orders.length < PAGE) break
      if (truncated) break
    }

    const ok = errors.length === 0 && !truncated
    const message = truncated
      ? `Order reconcile truncated at ${CAP} orders (checked ${checked}). Re-run to continue.`
      : `Order reconcile: checked ${checked}, updated ${updated}, unchanged ${skipped}, errors ${errors.length}.`
    if (log) {
      await this.ops.finish(log.id, {
        status: ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
        refreshed: updated,
        failed: errors.length,
        detail: message,
        error: errors.slice(0, 5).join('; ') || undefined,
      })
    }
    return {
      ok,
      checked,
      updated,
      skipped,
      message,
      errors,
    }
  }
}
