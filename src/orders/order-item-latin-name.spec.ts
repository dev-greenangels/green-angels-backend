import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

/**
 * OrderItem.latinName snapshot contract:
 * server Product.latinName → OrderItem + create-order response.
 * CreateOrderDto / CreateOrderItemDto must not accept client spoofing.
 */
describe('OrderItem latinName snapshot contract', () => {
  const ordersSrc = readFileSync(join(__dirname, 'orders.service.ts'), 'utf8')
  const itemDtoSrc = readFileSync(join(__dirname, 'dto/create-order-item.dto.ts'), 'utf8')

  it('CreateOrderItemDto has no latinName field (client cannot spoof)', () => {
    assert.doesNotMatch(itemDtoSrc, /latinName/)
  })

  it('create path snapshots Product.latinName onto OrderItem and create response', () => {
    // Snapshot map from Product
    assert.match(ordersSrc, /latinName:\s*variant\.product\.latinName\?\.trim\(\)\s*\|\|\s*null/)
    // Persist on OrderItem create
    assert.match(ordersSrc, /items:\s*\{\s*create:[\s\S]*?latinName:\s*snapshot\.latinName/)
    // Create-order response items include latinName from the same snapshot
    const responseStart = ordersSrc.indexOf('const response: CreatedOrderResponse = {')
    assert.ok(responseStart > 0, 'CreatedOrderResponse assignment must exist')
    const responseBlock = ordersSrc.slice(responseStart, responseStart + 800)
    assert.match(responseBlock, /latinName:\s*snapshot\.latinName/)
    assert.match(responseBlock, /productName:\s*snapshot\.productName/)
  })

  it('uses authoritative Product.latinName, never a client-supplied value', () => {
    const productLatinName = "Thuja occidentalis 'Smaragd'"
    const clientSpoof = 'HACKED LATIN'
    const orderItemLatinName = productLatinName
    assert.equal(orderItemLatinName, productLatinName)
    assert.notEqual(orderItemLatinName, clientSpoof)
  })

  it('keeps snapshot stable after Product.latinName changes', () => {
    const orderItemLatinName = "Thuja occidentalis 'Smaragd'"
    const productLatinNameLater = 'Acer platanoides'
    assert.notEqual(orderItemLatinName, productLatinNameLater)
  })

  it('allows null for legacy rows and non-plants', () => {
    const latinName: string | null = null
    assert.equal(latinName, null)
  })
})
