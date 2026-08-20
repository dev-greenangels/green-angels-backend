import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  filterStromSubtree,
  isLikelyFlexiTreeCode,
  resolveStromTreeAndShopRoot,
} from './flexi-strom-subtree'

describe('flexi strom subtree', () => {
  it('treats STR_CEN as a tree code and Products as a folder', () => {
    assert.equal(isLikelyFlexiTreeCode('STR_CEN'), true)
    assert.equal(isLikelyFlexiTreeCode('Products'), false)
    assert.deepEqual(resolveStromTreeAndShopRoot('Products', ''), {
      treeCode: 'STR_CEN',
      shopRootCode: 'Products',
    })
    assert.deepEqual(resolveStromTreeAndShopRoot('STR_CEN', 'Products'), {
      treeCode: 'STR_CEN',
      shopRootCode: 'Products',
    })
  })

  it('keeps only the Products folder and its descendants', () => {
    const nodes = [
      { id: '1', kod: 'STR_CEN', parentId: null, parentKod: null },
      { id: '2', kod: 'ADD', parentId: '1', parentKod: 'STR_CEN' },
      { id: '3', kod: 'Products', parentId: '2', parentKod: 'ADD' },
      { id: '4', kod: 'ROSES', parentId: '3', parentKod: 'Products' },
      { id: '5', kod: 'ROSE-LEAF', parentId: '4', parentKod: 'ROSES' },
      { id: '6', kod: 'Materials', parentId: '2', parentKod: 'ADD' },
      { id: '7', kod: 'NONADD', parentId: '1', parentKod: 'STR_CEN' },
    ]
    const filtered = filterStromSubtree(nodes, 'Products')
    assert.deepEqual(
      filtered.map((node) => node.kod).sort(),
      ['Products', 'ROSE-LEAF', 'ROSES'],
    )
  })
})
