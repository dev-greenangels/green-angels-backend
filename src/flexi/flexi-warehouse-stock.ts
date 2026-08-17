import type { FlexiCenikItem } from './flexi.types'

/**
 * Qty written to ProductVariant / used at checkout.
 * Never keep cenik.sumDostupMj (all warehouses). Missing SKU on the
 * configured skladova-karta map → 0.
 */
export function applyWarehouseStock(
  items: FlexiCenikItem[],
  warehouseQtyBySku: ReadonlyMap<string, number>,
): FlexiCenikItem[] {
  return items.map((item) => ({
    ...item,
    stock: Math.max(0, Math.floor(warehouseQtyBySku.get(item.kod) ?? 0)),
  }))
}
