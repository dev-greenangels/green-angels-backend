import { normalizeFlexiEvidence } from './flexi.constants'

/**
 * Legacy FlexiChangeEvent evidence classification for production journal retirement.
 *
 * Classifications (FLEXI-LEGACY-RETIRE-002):
 * - CURRENT_STATE_RECOVERABLE — ABRA→SITE live/Full Refresh handlers own SITE state
 * - ORDER_RECONCILE — inbound order docs; recoverable via reconcileActiveErpOrders
 * - IRRELEVANT_TO_SITE — no ABRA→SITE SITE state; INSERT/UPDATE/DELETE do not block retirement
 * - BLOCKER — cannot prove irrelevance; blocks safeToRetire
 *
 * SITE→ABRA export may *reference* codes from IRRELEVANT evidence (typDokl, stat, sklad code)
 * without requiring historical notification replay.
 */
export type LegacyEvidenceClassification =
  | 'CURRENT_STATE_RECOVERABLE'
  | 'ORDER_RECONCILE'
  | 'IRRELEVANT_TO_SITE'
  | 'BLOCKER'

/** @deprecated use IRRELEVANT_TO_SITE */
export type LegacyEvidenceClassificationLegacyAlias = 'IRRELEVANT' | 'UNKNOWN'

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

/**
 * Exact / prefix evidences proven IRRELEVANT_TO_SITE by code audit (FLEXI-LEGACY-RETIRE-002).
 * Each entry must have a rationale in comments + tests — do not bulk-whitelist.
 */
const IRRELEVANT_TO_SITE_EXACT = [
  // ABRA counterparty evidence. SITE never imports odberatel→User/Contractor/Order.
  // SITE→ABRA writes adresar (putAdresar) with typVztahuK=typVztahu.odberatel (enum), not this evidence.
  // Proof: flexi.service upsertAdresar*, flexi.client putAdresar/findAdresar*; no EvidenceHandler.
  'odberatel',
  // Warehouse master. SITE stock uses skladova-karta.dostupMj for settings.defaultStockCode only.
  // Evidence "sklad" has no handler; Full Refresh does not sync warehouse masters into SITE DB.
  'sklad',
  // FX rate master. Export may note fxRateUsed on Order; no inbound kurz sync.
  'kurz',
  // Country master. Export writes document.stat / adresar.stat as code:XX from SITE order fields.
  'stat',
] as const

const IRRELEVANT_TO_SITE_MARKERS = [
  // Invoice type masters — SITE→ABRA uses settings.issuedInvoiceTypeCode / receivedInvoiceDocTypeCode as code:
  'typ-faktury',
  // Order type master — SITE→ABRA uses settings.orderDocTypeCode as code: (not inbound sync)
  'typ-objednavky',
  // Document status catalogue — SITE maps business status locally; no inbound stav-obchod sync
  'stav-obchodniho-dokladu',
  // Known noise / config (prior audits)
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

/** Order *documents* only — not typ-objednavky-* config evidences. */
function isInboundOrderDocumentEvidence(ev: string): boolean {
  return ev === 'objednavka-prijata' || ev.startsWith('objednavka-prijata-')
}

export function classifyLegacyEvidence(
  evidenceRaw: string,
  registeredLiveEvidences: readonly string[] = LEGACY_CURRENT_STATE_EVIDENCES,
): LegacyEvidenceClassification {
  const ev = normalizeFlexiEvidence(evidenceRaw)
  if (!ev) return 'BLOCKER'

  if (isInboundOrderDocumentEvidence(ev)) {
    return 'ORDER_RECONCILE'
  }

  // Stock card / reservation / tree / cenik — ABRA→SITE current-state handlers.
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

  for (const exact of IRRELEVANT_TO_SITE_EXACT) {
    if (ev === exact) return 'IRRELEVANT_TO_SITE'
  }

  for (const marker of IRRELEVANT_TO_SITE_MARKERS) {
    if (ev.includes(marker)) return 'IRRELEVANT_TO_SITE'
  }

  return 'BLOCKER'
}

/**
 * DELETE blocks retirement only when evidence owns SITE state we cannot reconstruct
 * without replaying that notification. IRRELEVANT_TO_SITE DELETE never blocks.
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
    case 'IRRELEVANT_TO_SITE':
      return {
        recoverableWithoutReplay: true,
        reason:
          'Evidence does not drive ABRA→SITE SITE state (INSERT/UPDATE/DELETE all irrelevant to journal retirement).',
      }
    case 'BLOCKER':
    default:
      return {
        recoverableWithoutReplay: false,
        reason: `BLOCKER evidence "${normalizeFlexiEvidence(evidenceRaw)}" — cannot prove recovery without journal.`,
      }
  }
}

/** Documented: normal live path does not read/write FlexiChangeEvent. */
export const NORMAL_RUNTIME_DEPENDS_ON_JOURNAL = false as const

/**
 * Sole Prisma create path for FlexiChangeEvent in this codebase.
 * Must remain unreachable from webhook/poll/Full Refresh/export (zero callers).
 */
export const FLEXI_CHANGE_EVENT_CREATE_ENTRYPOINTS = ['FlexiChangeIntakeService.ingestChanges'] as const

export const LEGACY_RETIRE_CONFIRM = 'RETIRE_LEGACY_FLEXI_JOURNAL'
export const LEGACY_DELETE_BATCH_SIZE = 1000
