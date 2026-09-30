import { normalizeFlexiEvidence } from '../flexi.constants'

/**
 * Extensible ABRA → SITE current-state handler.
 * Webhook/poll only notify; handlers GET current Flexi state and apply locally.
 * Add a new evidence by implementing this + registering in FlexiModule — no webhook rewrite.
 */
export type FlexiRefreshOutcome =
  | { status: 'updated'; detail?: string }
  | { status: 'missing'; detail?: string }
  | { status: 'skipped'; detail?: string }
  | { status: 'noop'; detail?: string }

export type FlexiFullSyncParticipantResult = {
  ok: boolean
  name: string
  message: string
  refreshed?: number
  unpublished?: number
  deactivated?: number
  /** Honest metric bags only — UI must not invent missing counters. */
  counts?: Record<string, number>
  errors?: string[]
}

export type FlexiEvidenceRefreshContext = {
  operation?: string
  /** When true, temporary Flexi/network errors should throw for Bull retry. */
  allowRetry: boolean
}

export interface FlexiEvidenceHandler {
  /** Evidence keys this handler owns (normalized lowercase). */
  readonly evidences: readonly string[]
  /** Participate in live webhook / coalesce refresh. */
  readonly liveSync: boolean
  /** Participate in authoritative Full Refresh orchestration. */
  readonly includeInFullRefresh: boolean
  /** After Auto Sync OFF, include in Update & Enable / recovery order reconcile set. */
  readonly includeInOffReconcile: boolean

  matches(evidence: string): boolean
  coalesceKey(evidence: string, objectId: string): string
  refreshCurrentState(
    evidence: string,
    objectId: string,
    ctx: FlexiEvidenceRefreshContext,
  ): Promise<FlexiRefreshOutcome>
  /** Optional: ABRA object gone (404 / operation=delete). Default: noop. */
  onMissing?(
    evidence: string,
    objectId: string,
    ctx: FlexiEvidenceRefreshContext,
  ): Promise<FlexiRefreshOutcome>
  /** Optional Full Refresh segment. */
  runFullRefresh?(): Promise<FlexiFullSyncParticipantResult>
}

export function evidenceMatches(
  handler: Pick<FlexiEvidenceHandler, 'evidences'>,
  evidence: string,
): boolean {
  const ev = normalizeFlexiEvidence(evidence)
  if (!ev) return false
  return handler.evidences.some((owned) => {
    const o = normalizeFlexiEvidence(owned)
    if (o === ev) return true
    // Prefix ownership for variants like skladova-karta / skladova-karta-xyz
    if (o && ev.startsWith(o)) return true
    return false
  })
}

export const FLEXI_EVIDENCE_HANDLERS = Symbol('FLEXI_EVIDENCE_HANDLERS')
