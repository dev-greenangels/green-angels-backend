import { PackagingKind } from '@prisma/client'

export const PACKAGING_KIND_ORDER: PackagingKind[] = [
  'POT',
  'ROOT_BALL',
  'BARE_ROOT',
  'POT_ROOT_BALL',
]

export function inferPackagingKind(label: string, slug: string): PackagingKind | null {
  const normalizedLabel = label.trim()
  const normalizedSlug = slug.trim().toLowerCase()
  if (!normalizedLabel && !normalizedSlug) return null

  const codeToken = (normalizedLabel.split(/\s+/)[0] ?? normalizedSlug).toUpperCase()

  if (/^CWRB/.test(codeToken) || normalizedSlug.startsWith('cwrb')) {
    return PackagingKind.POT_ROOT_BALL
  }
  if (/^WRB/.test(codeToken) || normalizedSlug.startsWith('wrb')) {
    return PackagingKind.ROOT_BALL
  }
  if (/^RB/.test(codeToken) || /^rb(-|$)/.test(normalizedSlug)) {
    return PackagingKind.BARE_ROOT
  }
  if (/^P\d/.test(codeToken) || /^p\d/.test(normalizedSlug)) {
    return PackagingKind.POT
  }
  if (/^C\d/.test(codeToken) || /^c\d/.test(normalizedSlug)) {
    return PackagingKind.POT
  }
  if (/горщик|контейнер|бокс/i.test(normalizedLabel)) {
    return PackagingKind.POT
  }
  if (/ком\/сітка\/горщ|горщ.*ком/i.test(normalizedLabel)) {
    return PackagingKind.POT_ROOT_BALL
  }
  if (/ком\/сітка/i.test(normalizedLabel)) {
    return PackagingKind.ROOT_BALL
  }
  if (/голий\s*корін/i.test(normalizedLabel)) {
    return PackagingKind.BARE_ROOT
  }
  if (/\bком\b/i.test(normalizedLabel)) {
    return PackagingKind.BARE_ROOT
  }

  return null
}

export function resolvePackagingKind(
  label: string,
  slug: string,
  explicit?: PackagingKind | null,
): PackagingKind | null {
  if (explicit) return explicit
  return inferPackagingKind(label, slug)
}
