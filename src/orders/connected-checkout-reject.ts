import { isFlexiStockShortageMessage } from './erp-sync.errors'

/**
 * Decide whether a connected Flexi export reject should surface as stock shortage
 * or as a generic order-processing failure (e.g. missing forma úhrady / cenik).
 */
export function isConnectedCheckoutStockReject(input: {
  exportMessage: string
  stockHintUnavailable: boolean
}): boolean {
  if (input.stockHintUnavailable) return true
  return isFlexiStockShortageMessage(input.exportMessage)
}
