import type { PrismaService } from '../prisma/prisma.service'

export type CategoryDescendantMap = Map<string, Set<string>>

export async function buildCategoryDescendantMap(
  prisma: PrismaService,
): Promise<CategoryDescendantMap> {
  const categories = await prisma.category.findMany({
    select: { id: true, parentId: true },
  })

  const childrenByParent = new Map<string | null, string[]>()
  for (const category of categories) {
    const key = category.parentId
    const list = childrenByParent.get(key) ?? []
    list.push(category.id)
    childrenByParent.set(key, list)
  }

  const expansion = new Map<string, Set<string>>()

  const collectDescendants = (id: string): Set<string> => {
    const cached = expansion.get(id)
    if (cached) return cached

    const set = new Set<string>([id])
    for (const childId of childrenByParent.get(id) ?? []) {
      for (const descendantId of collectDescendants(childId)) {
        set.add(descendantId)
      }
    }
    expansion.set(id, set)
    return set
  }

  for (const category of categories) {
    collectDescendants(category.id)
  }

  return expansion
}

export function expandCategoryIds(
  categoryIds: string[],
  expansion: CategoryDescendantMap,
): Set<string> {
  const expanded = new Set<string>()
  for (const id of categoryIds) {
    const descendants = expansion.get(id)
    if (descendants) {
      for (const descendantId of descendants) expanded.add(descendantId)
    } else {
      expanded.add(id)
    }
  }
  return expanded
}
