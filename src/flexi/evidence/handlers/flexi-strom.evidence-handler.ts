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
 * Any strom tree notification coalesces to ONE catalog current-state sync.
 * objectId is typically "*" for tree-wide events.
 */
@Injectable()
export class FlexiStromEvidenceHandler implements FlexiEvidenceHandler {
  private readonly logger = new Logger(FlexiStromEvidenceHandler.name)
  readonly evidences = ['strom'] as const
  readonly liveSync = true
  readonly includeInFullRefresh = true
  readonly includeInOffReconcile = false

  constructor(private readonly flexi: FlexiService) {}

  matches(evidence: string): boolean {
    const ev = normalizeFlexiEvidence(evidence)
    return ev.includes('strom') && !ev.includes('strom-cenik')
  }

  coalesceKey(_evidence: string, _objectId: string): string {
    return 'strom:*'
  }

  async refreshCurrentState(
    _evidence: string,
    _objectId: string,
    ctx: FlexiEvidenceRefreshContext,
  ): Promise<FlexiRefreshOutcome> {
    try {
      const result = await this.flexi.syncStromCatalog({
        createMissing: true,
        absorbJournal: false,
        reconcileMissing: true,
      })
      if (!result.ok && result.categoriesUpserted === 0 && result.productsUpserted === 0) {
        if (ctx.allowRetry) throw new Error(result.message || 'Strom sync failed')
        return { status: 'skipped', detail: result.message }
      }
      return {
        status: 'updated',
        detail: `cats ${result.categoriesUpserted}, products ${result.productsUpserted}, unpub ${result.unpublished ?? 0}`,
      }
    } catch (error) {
      if (ctx.allowRetry) throw error
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`strom refresh: ${message}`)
      return { status: 'skipped', detail: message }
    }
  }

  async runFullRefresh(): Promise<FlexiFullSyncParticipantResult> {
    const result = await this.flexi.syncStromCatalog({
      createMissing: true,
      absorbJournal: false,
      reconcileMissing: true,
    })
    return {
      ok: result.ok,
      name: 'strom-catalog',
      message: result.message,
      refreshed: result.productsUpserted + result.variantsUpserted + result.categoriesUpserted,
      unpublished: result.unpublished,
      deactivated: result.deactivatedCategories,
      counts: {
        categories: result.categoriesUpserted,
        products: result.productsUpserted,
        variants: result.variantsUpserted,
        unpublished: result.unpublished ?? 0,
        deactivatedCategories: result.deactivatedCategories ?? 0,
      },
      errors: result.errors.length ? result.errors.slice(0, 20) : undefined,
    }
  }
}
