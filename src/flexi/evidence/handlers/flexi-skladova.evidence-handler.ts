import { Injectable, Logger } from '@nestjs/common'

import { isFlexiMissingRecordError, normalizeFlexiEvidence } from '../../flexi.constants'
import { FlexiClient } from '../../flexi.client'
import { FlexiService } from '../../flexi.service'
import type {
  FlexiEvidenceHandler,
  FlexiEvidenceRefreshContext,
  FlexiRefreshOutcome,
} from '../flexi-evidence.handler'

/**
 * skladova-karta → resolve cenik id → current cenik apply (warehouse stock overlay inside client).
 */
@Injectable()
export class FlexiSkladovaEvidenceHandler implements FlexiEvidenceHandler {
  private readonly logger = new Logger(FlexiSkladovaEvidenceHandler.name)
  readonly evidences = ['skladova-karta'] as const
  readonly liveSync = true
  readonly includeInFullRefresh = false // covered by cenik-full + strom stock overlay
  readonly includeInOffReconcile = false

  constructor(
    private readonly client: FlexiClient,
    private readonly flexi: FlexiService,
  ) {}

  matches(evidence: string): boolean {
    const ev = normalizeFlexiEvidence(evidence)
    return ev.includes('skladova-karta') || ev.includes('skladova')
  }

  coalesceKey(_evidence: string, objectId: string): string {
    // Coalesce on karta id; after resolve we still refresh one cenik.
    return `skladova-karta:${objectId}`
  }

  async refreshCurrentState(
    _evidence: string,
    objectId: string,
    ctx: FlexiEvidenceRefreshContext,
  ): Promise<FlexiRefreshOutcome> {
    const op = (ctx.operation ?? '').toLowerCase()
    if (op === 'delete') {
      return { status: 'missing', detail: objectId }
    }
    try {
      const cenikId = await this.client.resolveCenikIdFromSkladovaKarta(objectId)
      if (!cenikId) {
        return { status: 'missing', detail: `no cenik for karta ${objectId}` }
      }
      const item = await this.client.fetchCenikById(cenikId)
      if (!item) {
        return { status: 'missing', detail: cenikId }
      }
      const result = await this.flexi.applyCenikItem(item)
      return result === 'updated'
        ? { status: 'updated', detail: item.kod }
        : { status: 'noop', detail: `unmatched sku ${item.kod}` }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (isFlexiMissingRecordError(message)) {
        return { status: 'missing', detail: message }
      }
      if (ctx.allowRetry) throw error
      this.logger.warn(`skladova refresh ${objectId}: ${message}`)
      return { status: 'skipped', detail: message }
    }
  }
}
