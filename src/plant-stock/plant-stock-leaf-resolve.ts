/**
 * Resolve ABRA strom leaf id for a cenik row from strom-cenik link indexes.
 * Prefer SKU kod; fall back to Flexi numeric cenik id (idZaznamu).
 */
export function resolveStromLeafId(opts: {
  sku: string
  flexiId: string
  leafIdBySku: Map<string, string>
  leafIdByCenikId: Map<string, string>
}): string | null {
  const sku = opts.sku.trim()
  const flexiId = String(opts.flexiId ?? '').trim()
  if (sku && !/^\d+$/.test(sku)) {
    const bySku = opts.leafIdBySku.get(sku)
    if (bySku) return bySku
  }
  if (flexiId) {
    const byId = opts.leafIdByCenikId.get(flexiId)
    if (byId) return byId
  }
  if (sku && /^\d+$/.test(sku)) {
    return opts.leafIdByCenikId.get(sku) ?? null
  }
  return null
}

export function indexStromCenikLinks(
  links: Array<{ cenikKod: string; cenikId: string; uzelId: string }>,
): { leafIdBySku: Map<string, string>; leafIdByCenikId: Map<string, string> } {
  const leafIdBySku = new Map<string, string>()
  const leafIdByCenikId = new Map<string, string>()
  for (const link of links) {
    const uzel = link.uzelId.trim()
    if (!uzel) continue
    const kod = link.cenikKod?.trim()
    const cenikId = link.cenikId?.trim()
    if (kod && !/^\d+$/.test(kod)) leafIdBySku.set(kod, uzel)
    if (cenikId) leafIdByCenikId.set(cenikId, uzel)
    if (kod && /^\d+$/.test(kod)) leafIdByCenikId.set(kod, uzel)
  }
  return { leafIdBySku, leafIdByCenikId }
}
