export function parseSlugFilterPairs(input?: string): Array<[string, string]> {
  if (!input?.trim()) return []

  return input
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf('=')
      if (separator === -1) return null
      const key = pair.slice(0, separator).trim()
      const value = pair.slice(separator + 1).trim()
      if (!key || !value) return null
      return [key, value] as [string, string]
    })
    .filter((pair): pair is [string, string] => pair != null)
}

export function serializeSlugFilterPairs(pairs: Array<[string, string]>): string {
  return pairs.map(([key, value]) => `${key}=${value}`).join(',')
}

/** Remove one filter group (by slug) from serialized slug=value pairs. */
export function excludeSlugFilterGroup(input: string | undefined, slugToExclude: string): string | undefined {
  if (!input?.trim() || !slugToExclude.trim()) return input?.trim() || undefined

  const groups = groupSlugFilterPairs(input)
  groups.delete(slugToExclude.trim())
  if (!groups.size) return undefined

  const pairs: Array<[string, string]> = []
  for (const [key, values] of groups) {
    for (const value of values) {
      pairs.push([key, value])
    }
  }
  return serializeSlugFilterPairs(pairs)
}

/** Групує пари slug=value за ключем; кілька значень одного фільтра — OR, різні фільтри — AND. */
export function groupSlugFilterPairs(input?: string): Map<string, string[]> {
  const groups = new Map<string, string[]>()

  for (const [key, value] of parseSlugFilterPairs(input)) {
    const current = groups.get(key) ?? []
    if (!current.includes(value)) current.push(value)
    groups.set(key, current)
  }

  return groups
}

export type CatalogAvailableFacets = {
  optionIdsByCharacteristic: Record<string, string[]>
  valueIdsByAttribute: Record<string, string[]>
}

type FacetFilterableCharacteristic = {
  id: string
  slug: string
  options: Array<{ id: string; slug: string }>
}

type FacetFilterableAttribute = {
  id: string
  slug: string
  values: Array<{ id: string; slug: string }>
}

export function filterCharacteristicsByFacets<T extends FacetFilterableCharacteristic>(
  characteristics: T[],
  facets: CatalogAvailableFacets,
  activeCharacteristics?: string,
): T[] {
  const active = groupSlugFilterPairs(activeCharacteristics)

  return characteristics
    .map((characteristic) => ({
      ...characteristic,
      options: characteristic.options.filter((option) => {
        const available = new Set(facets.optionIdsByCharacteristic[characteristic.id] ?? [])
        const selected = active.get(characteristic.slug) ?? []
        return available.has(option.id) || selected.includes(option.slug)
      }),
    }))
    .filter((characteristic) => characteristic.options.length > 0)
}

export function filterVariantAttributesByFacets<T extends FacetFilterableAttribute>(
  attributes: T[],
  facets: CatalogAvailableFacets,
  activeVariantAttributes?: string,
): T[] {
  const active = groupSlugFilterPairs(activeVariantAttributes)

  return attributes
    .map((attribute) => ({
      ...attribute,
      values: attribute.values.filter((value) => {
        const available = new Set(facets.valueIdsByAttribute[attribute.id] ?? [])
        const selected = active.get(attribute.slug) ?? []
        return available.has(value.id) || selected.includes(value.slug)
      }),
    }))
    .filter((attribute) => attribute.values.length > 0)
}
