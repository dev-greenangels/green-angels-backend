import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'

import { BackstagePlantStockController } from './backstage-plant-stock.controller'

describe('BackstagePlantStockController routes', () => {
  it('exposes POST /backstage/plant-stock/stock/sync', () => {
    const ctrlPath = Reflect.getMetadata(PATH_METADATA, BackstagePlantStockController)
    assert.equal(ctrlPath, 'backstage/plant-stock')

    const handler = BackstagePlantStockController.prototype.syncStock
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), 'stock/sync')
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.POST)
  })
})
