import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildNarrowViesPoznamPutPayload,
  buildViesPoznamBlock,
  countMarkedViesBlocks,
  upsertViesPoznamBlock,
} from './flexi-vies-poznam'

describe('flexi-vies-poznam', () => {
  it('ERROR initial block: REVIEW REQUIRED, not INVALID', () => {
    const body = buildViesPoznamBlock({
      status: 'ERROR',
      buyerVatId: 'PL1234567890',
      checkedAtIso: '2026-10-01T10:00:00.000Z',
      taxRegime: 'seller',
    })
    assert.match(body, /VIES REVIEW REQUIRED/)
    assert.match(body, /verification unavailable/)
    assert.match(body, /Buyer VAT: PL1234567890/)
    assert.match(body, /VAT applied to order/)
    assert.doesNotMatch(body, /\bINVALID\b/)
    assert.doesNotMatch(body, /VIES status: VALID/)
  })

  it('INVALID: INVALID + VAT applied, no REVIEW REQUIRED', () => {
    const body = buildViesPoznamBlock({
      status: 'INVALID',
      buyerVatId: 'PL1234567890',
      checkedAtIso: '2026-10-01T10:00:00.000Z',
      taxRegime: 'destination',
    })
    assert.match(body, /VIES status: INVALID/)
    assert.match(body, /VAT applied to order/)
    assert.doesNotMatch(body, /REVIEW REQUIRED/)
  })

  it('VALID at create with reverse_charge: no REVIEW / no VAT applied warning', () => {
    const body = buildViesPoznamBlock({
      status: 'VALID',
      buyerVatId: 'PL1234567890',
      checkedAtIso: '2026-10-01T10:00:00.000Z',
      taxRegime: 'reverse_charge',
      requestIdentifier: 'WAPI….123',
      registeredName: 'ACME SP Z O O',
    })
    assert.match(body, /VIES status: VALID/)
    assert.doesNotMatch(body, /REVIEW REQUIRED/)
    assert.doesNotMatch(body, /VAT applied to order/)
    assert.match(body, /VIES consultation:/)
    assert.match(body, /VIES name:/)
  })

  it('NOT_CHECKED: upsert helper not called — empty unrelated notes stay clean', () => {
    const notes = 'PacketaPoint:123\nPlatba: bank-transfer'
    assert.equal(countMarkedViesBlocks(notes), 0)
    assert.doesNotMatch(notes, /REVIEW REQUIRED/)
  })

  it('retry ERROR → VALID: tax unchanged wording; unrelated notes preserved', () => {
    const existing = [
      'Customer note keep me',
      'PacketaPoint:999',
      'VIES unavailable @ 2026-09-01T00:00:00.000Z',
      'Buyer VAT: PL1234567890',
    ].join('\n')
    const body = buildViesPoznamBlock({
      status: 'VALID',
      buyerVatId: 'PL1234567890',
      checkedAtIso: '2026-10-01T12:00:00.000Z',
      taxRegime: 'seller',
      verifiedAfterOrderCreation: true,
    })
    const merged = upsertViesPoznamBlock(existing, body)
    assert.match(merged, /Customer note keep me/)
    assert.match(merged, /PacketaPoint:999/)
    assert.doesNotMatch(merged, /VIES unavailable @/)
    assert.match(merged, /verified after order creation/)
    assert.match(merged, /Original order tax unchanged/)
    assert.equal(countMarkedViesBlocks(merged), 1)
  })

  it('retry ERROR → ERROR keeps REVIEW REQUIRED', () => {
    const body = buildViesPoznamBlock({
      status: 'ERROR',
      buyerVatId: 'PL1',
      checkedAtIso: '2026-10-01T13:00:00.000Z',
      taxRegime: 'seller',
      verifiedAfterOrderCreation: true,
    })
    assert.match(body, /VIES REVIEW REQUIRED/)
    assert.match(body, /Original order tax unchanged/)
  })

  it('retry INVALID → VALID: historical tax unchanged', () => {
    const body = buildViesPoznamBlock({
      status: 'VALID',
      buyerVatId: 'CZ12345678',
      checkedAtIso: '2026-10-01T14:00:00.000Z',
      taxRegime: 'seller',
      verifiedAfterOrderCreation: true,
    })
    assert.match(body, /verified after order creation/)
    assert.match(body, /Original order tax unchanged/)
  })

  it('repeated upsert leaves exactly one VIES block', () => {
    let poznam = 'Platba: card-online\nDPH 23% (seller / sk)'
    for (let i = 0; i < 3; i++) {
      poznam = upsertViesPoznamBlock(
        poznam,
        buildViesPoznamBlock({
          status: 'ERROR',
          buyerVatId: 'PL123',
          checkedAtIso: `2026-10-01T1${i}:00:00.000Z`,
          taxRegime: 'seller',
          verifiedAfterOrderCreation: i > 0,
        }),
      )
    }
    assert.equal(countMarkedViesBlocks(poznam), 1)
    assert.match(poznam, /Platba: card-online/)
    assert.match(poznam, /DPH 23%/)
  })

  it('legacy VIES lines replaced without removing unrelated notes', () => {
    const legacy = [
      'Datum odoslania: 2026-10-05',
      'VIES valid @ 2026-09-01T00:00:00.000Z',
      'Buyer VAT: ATU12345678',
      'VIES consultation: ABC',
      'VIES name: Firma GmbH',
      'Platba: bank-transfer',
    ].join('\n')
    const merged = upsertViesPoznamBlock(
      legacy,
      buildViesPoznamBlock({
        status: 'INVALID',
        buyerVatId: 'ATU12345678',
        checkedAtIso: '2026-10-01T15:00:00.000Z',
        taxRegime: 'seller',
      }),
    )
    assert.match(merged, /Datum odoslania/)
    assert.match(merged, /Platba: bank-transfer/)
    assert.doesNotMatch(merged, /VIES valid @/)
    assert.doesNotMatch(merged, /VIES consultation: ABC/)
    assert.equal(countMarkedViesBlocks(merged), 1)
  })

  it('narrow Flexi update payload contains only id + poznam', () => {
    const payload = buildNarrowViesPoznamPutPayload({
      flexiOrderId: 'ext:GA:abc',
      poznam: '[GA:VIES]\nVIES status: VALID\n[/GA:VIES]',
    })
    assert.deepEqual(Object.keys(payload).sort(), ['id', 'poznam'])
    assert.equal(payload.id, 'ext:GA:abc')
    assert.equal('polozkyDokladu' in payload, false)
    assert.equal('szbDph' in payload, false)
    assert.equal('rezervovat' in payload, false)
    assert.equal('typCenyDphK' in payload, false)
  })
})
