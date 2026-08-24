/** Pot / container size as used on SK Flexi cenik (C2, P9, C1.5, C2L). */
const SIZE_TOKEN = '((?:P|C)\\d+(?:\\.\\d+)?L?)'
/** Non-pot type suffixes used on Flexi names (CUT cuttings, GROW young plants). */
const TYPE_TOKEN = '(CUT|GROW)'

/**
 * Size for variant attributes.
 * Auto-generated Flexi `kod` no longer ends with C2/P9 — that lives on Name,
 * e.g. `Achillea millefolium 'Sassy Summer Lemon' PBR - C2`.
 * Legacy SKUs like `PENN-ALO-LADYU-C2` still work as fallback.
 * Also recognizes `… - CUT` / `… - GROW`.
 */
export function parseSizeLabel(kod: string, nazev: string): string | null {
  const fromName = parseSizeFromName(nazev)
  if (fromName) return fromName
  const fromKod = kod.trim().match(new RegExp(`(?:^|[-_\\s])${SIZE_TOKEN}$`, 'i'))
  if (fromKod?.[1]) return fromKod[1].toUpperCase()
  const typeFromKod = kod.trim().match(new RegExp(`(?:^|[-_\\s])${TYPE_TOKEN}$`, 'i'))
  if (typeFromKod?.[1]) return typeFromKod[1].toUpperCase()
  return null
}

function parseSizeFromName(nazev: string): string | null {
  const trimmed = nazev.trim()
  if (!trimmed) return null
  const potAtEnd = trimmed.match(new RegExp(`[-–—]\\s*${SIZE_TOKEN}\\s*$`, 'i'))
  if (potAtEnd?.[1]) return potAtEnd[1].toUpperCase()
  const typeAtEnd = trimmed.match(new RegExp(`[-–—]\\s*${TYPE_TOKEN}\\s*$`, 'i'))
  if (typeAtEnd?.[1]) return typeAtEnd[1].toUpperCase()
  const allPots = [...trimmed.matchAll(new RegExp(SIZE_TOKEN, 'gi'))]
  const lastPot = allPots[allPots.length - 1]
  if (lastPot?.[1]) return lastPot[1].toUpperCase()
  return null
}

/** True when Flexi nazev/kod matches the requested size/type (C2, CUT, …). */
export function matchesSizeLabel(
  kod: string,
  nazev: string,
  wantedSize: string | undefined | null,
): boolean {
  const wanted = wantedSize?.trim().toUpperCase()
  if (!wanted) return true
  const parsed = parseSizeLabel(kod, nazev)?.toUpperCase()
  if (parsed === wanted) return true
  const upperName = nazev.toUpperCase()
  return (
    upperName.includes(`- ${wanted}`) ||
    upperName.includes(`– ${wanted}`) ||
    upperName.includes(`— ${wanted}`) ||
    upperName.endsWith(` ${wanted}`) ||
    upperName.endsWith(`-${wanted}`)
  )
}
