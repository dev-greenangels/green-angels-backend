export type StromSubtreeNode = {
  id: string
  kod: string
  parentId: string | null
  parentKod: string | null
}

const DEFAULT_TREE_CODE = 'STR_CEN'

export function isLikelyFlexiTreeCode(code: string): boolean {
  const value = code.trim().toUpperCase()
  if (!value) return false
  if (value === 'STR_CEN' || value === 'STROM' || value === 'TREE') return true
  return value.startsWith('STR_')
}

export function resolveStromTreeAndShopRoot(
  treeCode: string,
  shopRootCode: string,
): { treeCode: string; shopRootCode: string } {
  const tree = treeCode.trim() || DEFAULT_TREE_CODE
  const shop = shopRootCode.trim()
  if (!shop && !isLikelyFlexiTreeCode(tree) && tree.toUpperCase() !== DEFAULT_TREE_CODE) {
    return { treeCode: DEFAULT_TREE_CODE, shopRootCode: tree }
  }
  return { treeCode: tree, shopRootCode: shop }
}

function parentKey(node: StromSubtreeNode): string | null {
  return node.parentId || node.parentKod || null
}

export function findStromNode(
  nodes: StromSubtreeNode[],
  codeOrId: string,
): StromSubtreeNode | null {
  const wanted = codeOrId.trim().toLowerCase()
  if (!wanted) return null
  return (
    nodes.find(
      (node) =>
        node.kod.trim().toLowerCase() === wanted || node.id.trim().toLowerCase() === wanted,
    ) ?? null
  )
}

/** Keep shop-root folder and its descendants (by parent id / kod). */
export function filterStromSubtree<T extends StromSubtreeNode>(nodes: T[], shopRootCode: string): T[] {
  const root = findStromNode(nodes, shopRootCode)
  if (!root) return []

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const byKod = new Map(nodes.filter((node) => node.kod).map((node) => [node.kod, node]))
  const allowed = new Set<string>([root.id])
  const queue = [root.id]

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const node of nodes) {
      if (allowed.has(node.id)) continue
      const parentId = node.parentId && byId.has(node.parentId) ? node.parentId : null
      const parentFromKod =
        node.parentKod && byKod.get(node.parentKod) ? byKod.get(node.parentKod)!.id : null
      const parent = parentId ?? parentFromKod
      if (parent === current) {
        allowed.add(node.id)
        queue.push(node.id)
      }
    }
  }

  return nodes.filter((node) => allowed.has(node.id))
}

export { parentKey, DEFAULT_TREE_CODE }
