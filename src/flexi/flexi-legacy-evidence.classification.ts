import { isOrderFlexiEvidence, normalizeFlexiEvidence } from './flexi.constants'

/**
 * Legacy FlexiChangeEvent evidence classification for production journal retirement.
 * CURRENT_STATE_RECOVERABLE / ORDER_RECONCILE are recoverable without replaying the journal
 * (Full Refresh + reconcileActiveErpOrders). IRRELEVANT is known noise. UNKNOWN blocks retirement.
 */
export type LegacyEvidenceClassification =
  | 'CURRENT_STATE_RECOVERABLE'
  | 'ORDER_RECONCILE'
  | 'IRRELEVANT'
  | 'UNKNOWN'

export type LegacyDeleteRecoveryPolicy = {
  recoverableWithoutReplay: boolean
  reason: string
}

/** Live/current-state evidences known to the new architecture (handlers). */
export const LEGACY_CURRENT_STATE_EVIDENCES = [
  'cenik',
  'skladova-karta',
  'strom',
  'strom-cenik',
  'rezervace',
] as const

/** Known Flexi noise that SITE current-state sync never applies. */
const IRRELEVANT_EVIDENCE_MARKERS = [
  'faktura',
  'zaloha',
  'banka',
  'pokladna',
  'interni-doklad',
  'pohledavka',
  'zavazek',
  'kusovnik',
  'vazba',
  'priloha',
  'udalost',
  'adresar',
  'kontakt',
  'ucet',
  'rada',
  'rocni-rada',
  'skladovy-pohyb',
  'typ-dokl',
  'ciselnik',
  'uzivatel',
  'nastaveni',
  'form',
  'report',
  'misto-urceni',
  'dodaci-list',
  'prijemka',
  'vydejka',
  'inventura',
  'prepravka',
  'atribut',
  'typ-atributu',
  'dodavatel',
  'cenova-uroven',
  'mapovani-skladu',
  'skupina-zbozi',
  'umisteni-ve-skladu',
  'filtr',
  'text',
  'stitek',
  'smlouva',
  'zakazka',
  'cenik-obal',
] as const

export function classifyLegacyEvidence(
  evidenceRaw: string,
  registeredLiveEvidences: readonly string[] = LEGACY_CURRENT_STATE_EVIDENCES,
): LegacyEvidenceClassification {
  const ev = normalizeFlexiEvidence(evidenceRaw)
  if (!ev) return 'UNKNOWN'

  if (isOrderFlexiEvidence(ev)) {
    return 'ORDER_RECONCILE'
  }

  if (ev.includes('skladova-karta') || ev === 'skladova') {
    return 'CURRENT_STATE_RECOVERABLE'
  }
  if (ev === 'rezervace' || ev.startsWith('rezervace')) {
    return 'CURRENT_STATE_RECOVERABLE'
  }
  if (ev.includes('strom')) {
    return 'CURRENT_STATE_RECOVERABLE'
  }
  if ((ev === 'cenik' || ev.startsWith('cenik')) && !ev.includes('strom-cenik')) {
    return 'CURRENT_STATE_RECOVERABLE'
  }

  for (const owned of registeredLiveEvidences) {
    const o = normalizeFlexiEvidence(owned)
    if (!o) continue
    if (ev === o) return 'CURRENT_STATE_RECOVERABLE'
  }

  for (const marker of IRRELEVANT_EVIDENCE_MARKERS) {
    if (ev.includes(marker)) return 'IRRELEVANT'
  }

  // Anything else is UNKNOWN — production preflight must block retirement.
  return 'UNKNOWN'
}

/**
 * Historical DELETE notifications: can current-state Full Refresh / order reconcile
 * restore SITE without replaying the journal row?
 */
export function deleteRecoveryPolicy(
  evidenceRaw: string,
  classification: LegacyEvidenceClassification,
): LegacyDeleteRecoveryPolicy {
  switch (classification) {
    case 'CURRENT_STATE_RECOVERABLE':
      return {
        recoverableWithoutReplay: true,
        reason:
          'Full Refresh (strom/cenik/skladova) + missing handlers restore current ABRA state; journal DELETE not required.',
      }
    case 'ORDER_RECONCILE':
      return {
        recoverableWithoutReplay: true,
        reason:
          'reconcileActiveErpOrders pulls CURRENT ABRA order state for active SITE orders; historical order DELETEs are not replayed.',
      }
    case 'IRRELEVANT':
      return {
        recoverableWithoutReplay: true,
        reason: 'Evidence unused by SITE current-state pipeline.',
      }
    case 'UNKNOWN':
    default:
      return {
        recoverableWithoutReplay: false,
        reason: `Unknown evidence "${normalizeFlexiEvidence(evidenceRaw)}" — cannot prove recovery without journal.`,
      }
  }
}

/** Documented: normal live path does not read/write FlexiChangeEvent. */
export const NORMAL_RUNTIME_DEPENDS_ON_JOURNAL = false as const

export const LEGACY_RETIRE_CONFIRM = 'RETIRE_LEGACY_FLEXI_JOURNAL'
export const LEGACY_DELETE_BATCH_SIZE = 1000
