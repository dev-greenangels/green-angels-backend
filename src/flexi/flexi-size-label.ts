/** Pot / container size as used on SK Flexi cenik (C2, P9, C1.5, C2L). */
const SIZE_TOKEN = '((?:P|C)\\d+(?:\\.\\d+)?L?)'

/**
 * Size for variant attributes.
 * Auto-generated Flexi `kod` no longer ends with C2/P9 — that lives on Name,
 * e.g. `Achillea millefolium 'Sassy Summer Lemon' PBR - C2`.
 * Legacy SKUs like `PENN-ALO-LADYU-C2` still work as fallback.
 */
export function parseSizeLabel(kod: string, nazev: string): string | null {
  const fromName = parseSizeFromName(nazev)
  if (fromName) return fromName
  const fromKod = kod.trim().match(new RegExp(`(?:^|[-_\\s])${SIZE_TOKEN}$`, 'i'))
  if (fromKod?.[1]) return fromKod[1].toUpperCase()
  return null
}

function parseSizeFromName(nazev: string): string | null {
  const trimmed = nazev.trim()
  if (!trimmed) return null
  const atEnd = trimmed.match(new RegExp(`[-–—]\\s*${SIZE_TOKEN}\\s*$`, 'i'))
  if (atEnd?.[1]) return atEnd[1].toUpperCase()
  const all = [...trimmed.matchAll(new RegExp(SIZE_TOKEN, 'gi'))]
  const last = all[all.length - 1]
  if (last?.[1]) return last[1].toUpperCase()
  return null
}
