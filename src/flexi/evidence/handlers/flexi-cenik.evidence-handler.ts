import { Injectable, Logger } from '@nestjs/common'

import { isFlexiMissingRecordError, normalizeFlexiEvidence } from '../../flexi.constants'
import { FlexiClient } from '../../flexi.client'
import { FlexiService } from '../../flexi.service'
import type {
  FlexiEvidenceHandler,
  FlexiEvidenceRefreshContext,
  FlexiFullSyncParticipantResult,
  FlexiRefreshOutcome,
} from '../flexi-evidence.handler'

/**
 * cenik notifications → GET current cenik → applyCenikItem (price/stock/weight/cn).
 * Missing (404): cannot map Flexi id → SKU safely → noop (Full Refresh unpublish by strom).
 */
@Injectable()
export class FlexiCenikEvidenceHandler implements FlexiEvidenceHandler {
  private readonly logger = new Logger(FlexiCenikEvidenceHandler.name)
  readonly evidences = ['cenik'] as const
  readonly liveSync = true
  readonly includeInFullRefresh = true
  readonly includeInOffReconcile = false

  constructor(
    private readonly client: FlexiClient,
    private readonly flexi: FlexiService,
  ) {}

  matches(evidence: string): boolean {
    const ev = normalizeFlexiEvidence(evidence)
    return ev.includes('cenik') && !ev.includes('strom-cenik')
  }

  coalesceKey(_evidence: string, objectId: string): string {
    return `cenik:${objectId}`
  }

  async refreshCurrentState(
    _evidence: string,
    objectId: string,
    ctx: FlexiEvidenceRefreshContext,
  ): Promise<FlexiRefreshOutcome> {
    const op = (ctx.operation ?? '').toLowerCase()
    if (op === 'delete') {
      return this.onMissing(_evidence, objectId, ctx)
    }
    try {
      const item = await this.client.fetchCenikById(objectId)
      if (!item) {
        return this.onMissing(_evidence, objectId, ctx)
      }
      const result = await this.flexi.applyCenikItem(item)
      return result === 'updated'
        ? { status: 'updated', detail: item.kod }
        : { status: 'noop', detail: `unmatched sku ${item.kod}` }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (isFlexiMissingRecordError(message)) {
        return this.onMissing(_evidence, objectId, ctx)
      }
      if (ctx.allowRetry) throw error
      this.logger.warn(`cenik refresh ${objectId}: ${message}`)
      return { status: 'skipped', detail: message }
    }
  }

  async onMissing(
    _evidence: string,
    objectId: string,
    _ctx: FlexiEvidenceRefreshContext,
  ): Promise<FlexiRefreshOutcome> {
    // Safe: no hard delete; Full Refresh handles unpublished via strom set.
    this.logger.debug(`cenik ${objectId} missing in ABRA — live noop (use Full Refresh for unpublish)`)
    return { status: 'missing', detail: objectId }
  }

  async runFullRefresh(): Promise<FlexiFullSyncParticipantResult> {
    const result = await this.flexi.syncCenikFull()
    return {
      ok: result.ok,
      name: 'cenik-full',
      message: result.message,
      refreshed: result.itemsSynced,
      counts: {
        cenikUpdated: result.itemsSynced,
        cenikUnmatched: result.unmatched,
      },
      errors: result.ok ? undefined : [result.message],
    }
  }
}
