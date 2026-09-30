import { Injectable, Logger } from '@nestjs/common'

import { normalizeFlexiEvidence } from '../flexi.constants'
import {
  FLEXI_EVIDENCE_HANDLERS,
  evidenceMatches,
  type FlexiEvidenceHandler,
  type FlexiFullSyncParticipantResult,
} from './flexi-evidence.handler'
import { Inject } from '@nestjs/common'

@Injectable()
export class FlexiEvidenceRegistry {
  private readonly logger = new Logger(FlexiEvidenceRegistry.name)

  constructor(
    @Inject(FLEXI_EVIDENCE_HANDLERS)
    private readonly handlers: FlexiEvidenceHandler[],
  ) {}

  resolve(evidence: string): FlexiEvidenceHandler | null {
    const ev = normalizeFlexiEvidence(evidence)
    if (!ev) return null
    for (const handler of this.handlers) {
      if (handler.matches(evidence)) return handler
    }
    return null
  }

  liveHandlers(): FlexiEvidenceHandler[] {
    return this.handlers.filter((h) => h.liveSync)
  }

  fullRefreshParticipants(): FlexiEvidenceHandler[] {
    return this.handlers.filter((h) => h.includeInFullRefresh && typeof h.runFullRefresh === 'function')
  }

  async runFullRefreshAll(): Promise<FlexiFullSyncParticipantResult[]> {
    const results: FlexiFullSyncParticipantResult[] = []
    for (const handler of this.fullRefreshParticipants()) {
      try {
        const result = await handler.runFullRefresh!()
        results.push(result)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error(`Full refresh ${handler.evidences.join(',')}: ${message}`)
        results.push({
          ok: false,
          name: handler.evidences.join('|'),
          message,
          errors: [message],
        })
      }
    }
    return results
  }

  /** Test helper / diagnostics */
  listRegistered(): string[] {
    return this.handlers.flatMap((h) => [...h.evidences])
  }
}

export { evidenceMatches }
