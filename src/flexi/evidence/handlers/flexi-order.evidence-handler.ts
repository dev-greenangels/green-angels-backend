import { Injectable, Logger } from '@nestjs/common'

import { normalizeFlexiEvidence } from '../../flexi.constants'
import { FlexiService } from '../../flexi.service'
import type {
  FlexiEvidenceHandler,
  FlexiEvidenceRefreshContext,
  FlexiFullSyncParticipantResult,
  FlexiRefreshOutcome,
} from '../flexi-evidence.handler'

/**
 * objednavka-prijata → GET current order → syncOrderFromFlexi (status/tracking).
 */
@Injectable()
export class FlexiOrderEvidenceHandler implements FlexiEvidenceHandler {
  private readonly logger = new Logger(FlexiOrderEvidenceHandler.name)
  readonly evidences = ['objednavka-prijata'] as const
  readonly liveSync = true
  readonly includeInFullRefresh = false
  readonly includeInOffReconcile = true

  constructor(private readonly flexi: FlexiService) {}

  matches(evidence: string): boolean {
    return normalizeFlexiEvidence(evidence) === 'objednavka-prijata'
  }

  coalesceKey(_evidence: string, objectId: string): string {
    return `objednavka-prijata:${objectId}`
  }

  async refreshCurrentState(
    _evidence: string,
    objectId: string,
    ctx: FlexiEvidenceRefreshContext,
  ): Promise<FlexiRefreshOutcome> {
    try {
      await this.flexi.syncOrderFromFlexi(objectId)
      return { status: 'updated', detail: objectId }
    } catch (error) {
      if (ctx.allowRetry) throw error
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`order refresh ${objectId}: ${message}`)
      return { status: 'skipped', detail: message }
    }
  }

  async runFullRefresh(): Promise<FlexiFullSyncParticipantResult> {
    // Orders use dedicated reconcileActiveErpOrders — not part of catalog Full Refresh.
    return {
      ok: true,
      name: 'objednavka-prijata',
      message: 'Skipped in catalog Full Refresh — use order reconcile.',
      refreshed: 0,
    }
  }
}
