import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PlantStockSettingsService } from './plant-stock.settings.service'

describe('PlantStockSettingsService.normalize', () => {
  const svc = new PlantStockSettingsService(null as never)

  it('defaults service company and WHMAIN', () => {
    const s = svc.normalize({})
    assert.equal(s.serviceReservationCompanyCode, 'RESERVA-DORASTANIE')
    assert.deepEqual(s.allowedWarehouseCodes, ['WHMAIN'])
    assert.equal(s.inventoryPostingEnabled, false)
    assert.equal(s.legacyCreateSizeEnabled, false)
    assert.equal(s.inventoryTypDoklId, null)
    assert.equal(s.lastCatalogSyncAt, null)
    assert.equal(s.lastStockSyncAt, null)
    assert.equal(s.lastSyncMessage, null)
    assert.equal(s.lastSyncOk, null)
  })

  it('forces posting and legacy create off even if patch tries to enable', () => {
    const s = svc.normalize({
      inventoryPostingEnabled: true as unknown as false,
      legacyCreateSizeEnabled: true as unknown as false,
      allowedWarehouseCodes: ['whmain', 'WHGROW'],
    })
    assert.equal(s.inventoryPostingEnabled, false)
    assert.equal(s.legacyCreateSizeEnabled, false)
    assert.deepEqual(s.allowedWarehouseCodes, ['WHMAIN', 'WHGROW'])
  })

  it('preserves last sync metadata strings', () => {
    const s = svc.normalize({
      lastCatalogSyncAt: '2026-10-08T12:00:00.000Z',
      lastStockSyncAt: '2026-10-08T12:20:00.000Z',
      lastSyncMessage: 'ok',
      lastSyncOk: true,
    })
    assert.equal(s.lastCatalogSyncAt, '2026-10-08T12:00:00.000Z')
    assert.equal(s.lastStockSyncAt, '2026-10-08T12:20:00.000Z')
    assert.equal(s.lastSyncMessage, 'ok')
    assert.equal(s.lastSyncOk, true)
  })
})
