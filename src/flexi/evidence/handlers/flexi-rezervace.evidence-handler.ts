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
 * rezervace → resolve cenik → apply current cenik (warehouse dostupMj overlay).
 * Reservation changes emit rezervace AND usually skladova-karta; we still map rezervace
 * so stock refreshes if only rezervace arrives.
 */
@Injectable()
export class FlexiRezervaceEvidenceHandler implements FlexiEvidenceHandler {
  private readonly logger = new Logger(FlexiRezervaceEvidenceHandler.name)
  readonly evidences = ['rezervace'] as const
  readonly liveSync = true
  readonly includeInFullRefresh = false
  readonly includeInOffReconcile = false

  constructor(
    private readonly client: FlexiClient,
    private readonly flexi: FlexiService,
  ) {}

  matches(evidence: string): boolean {
    return normalizeFlexiEvidence(evidence) === 'rezervace'
  }

  coalesceKey(_evidence: string, objectId: string): string {
    return `rezervace:${objectId}`
  }

  async refreshCurrentState(
    _evidence: string,
    objectId: string,
    ctx: FlexiEvidenceRefreshContext,
  ): Promise<FlexiRefreshOutcome> {
    const op = (ctx.operation ?? '').toLowerCase()
    if (op === 'delete') {
      // Reservation deleted — still refresh cenik stock from warehouse card if we can resolve.
      // Fall through to resolve; missing rezervace is handled below.
    }
    try {
      const cenikId = await this.client.resolveCenikIdFromRezervace(objectId)
      if (!cenikId) {
        return { status: 'missing', detail: `no cenik for rezervace ${objectId}` }
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
      this.logger.warn(`rezervace refresh ${objectId}: ${message}`)
      return { status: 'skipped', detail: message }
    }
  }
}
