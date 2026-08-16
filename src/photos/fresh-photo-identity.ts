export type FreshPhotoIdentifierType = 'EAN' | 'SKU'

export type FreshPhotoIdentity = {
  identifierType: FreshPhotoIdentifierType
  identifier: string
}

export type FreshPhotoIdentityInput = {
  barcode?: string | null
  sku?: string | null
  identifier?: string | null
  identifierType?: string | null
}

function trim(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function parseType(raw: string | null | undefined): FreshPhotoIdentifierType | null {
  const normalized = trim(raw).toLowerCase()
  if (normalized === 'sku') return 'SKU'
  if (normalized === 'ean') return 'EAN'
  return null
}

/** Folder segment under uploads/estimate-photos/ — namespaces EAN vs SKU keys. */
export function estimateFolderForType(type: FreshPhotoIdentifierType): 'ean' | 'sku' {
  return type === 'SKU' ? 'sku' : 'ean'
}

/**
 * Resolve Fresh Photo identity for POST /photos/upload.
 * Legacy RN Estimate: barcode only → EAN.
 * SK: sku and/or identifierType=sku.
 * When both barcode and sku are present without identifierType, barcode (EAN) wins.
 */
export function resolveFreshPhotoIdentity(
  input: FreshPhotoIdentityInput,
): FreshPhotoIdentity | { error: string } {
  const type = parseType(input.identifierType)
  const identifier = trim(input.identifier)
  const sku = trim(input.sku)
  const barcode = trim(input.barcode)

  if (type === 'SKU') {
    const value = identifier || sku
    if (!value) return { error: 'Для identifierType=sku потрібен sku або identifier.' }
    return { identifierType: 'SKU', identifier: value }
  }
  if (type === 'EAN') {
    const value = identifier || barcode
    if (!value) return { error: 'Для identifierType=ean потрібен barcode або identifier.' }
    return { identifierType: 'EAN', identifier: value }
  }

  if (barcode) return { identifierType: 'EAN', identifier: barcode }
  if (sku) return { identifierType: 'SKU', identifier: sku }
  if (identifier) return { identifierType: 'EAN', identifier }
  return { error: 'Потрібен barcode (EAN) або sku.' }
}

export function isFreshPhotoIdentity(
  value: FreshPhotoIdentity | { error: string },
): value is FreshPhotoIdentity {
  return 'identifierType' in value && 'identifier' in value
}
