import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { previewReservationSync } from './plant-stock-reservation.preview'

describe('previewReservationSync', () => {
  const base = {
    serviceCompanyCode: 'RESERVA-DORASTANIE',
    skladKod: 'WHMAIN',
  }

  it('CREATE when no reservation and desired > 0', () => {
    const [row] = previewReservationSync({
      ...base,
      lines: [{ sku: 'PLANT1', currentQty: 10, freeQty: 7 }],
      existing: [],
    })
    assert.equal(row.operation, 'CREATE')
    assert.equal(row.desiredQty, 3)
    assert.equal(row.oldQty, null)
  })

  it('UPDATE when qty differs', () => {
    const [row] = previewReservationSync({
      ...base,
      lines: [{ sku: 'PLANT1', currentQty: 10, freeQty: 4 }],
      existing: [
        {
          id: '99',
          firma: 'code:RESERVA-DORASTANIE',
          cenik: 'code:PLANT1',
          sklad: 'code:WHMAIN',
          mnozstvi: 2,
          polObch: '',
        },
      ],
    })
    assert.equal(row.operation, 'UPDATE')
    assert.equal(row.desiredQty, 6)
    assert.equal(row.oldQty, 2)
    assert.equal(row.abraRezervaceId, '99')
  })

  it('NOOP when qty matches', () => {
    const [row] = previewReservationSync({
      ...base,
      lines: [{ sku: 'PLANT1', currentQty: 10, freeQty: 7 }],
      existing: [
        {
          id: '1',
          firma: 'code:RESERVA-DORASTANIE',
          cenik: 'code:PLANT1',
          sklad: 'code:WHMAIN',
          mnozstvi: 3,
          polObch: '',
        },
      ],
    })
    assert.equal(row.operation, 'NOOP')
  })

  it('DELETE when desired is 0 and reservation exists', () => {
    const [row] = previewReservationSync({
      ...base,
      lines: [{ sku: 'PLANT1', currentQty: 5, freeQty: 5 }],
      existing: [
        {
          id: '7',
          firma: 'code:RESERVA-DORASTANIE',
          cenik: 'code:PLANT1',
          sklad: 'code:WHMAIN',
          mnozstvi: 2,
          polObch: '',
        },
      ],
    })
    assert.equal(row.operation, 'DELETE')
    assert.equal(row.desiredQty, 0)
  })

  it('NOOP when desired is 0 and no reservation', () => {
    const [row] = previewReservationSync({
      ...base,
      lines: [{ sku: 'PLANT1', currentQty: 0, freeQty: 0 }],
      existing: [],
    })
    assert.equal(row.operation, 'NOOP')
  })

  it('CONFLICT on multiple matches', () => {
    const [row] = previewReservationSync({
      ...base,
      lines: [{ sku: 'PLANT1', currentQty: 10, freeQty: 5 }],
      existing: [
        {
          id: '1',
          firma: 'code:RESERVA-DORASTANIE',
          cenik: 'code:PLANT1',
          sklad: 'code:WHMAIN',
          mnozstvi: 1,
          polObch: '',
        },
        {
          id: '2',
          firma: 'code:RESERVA-DORASTANIE',
          cenik: 'code:PLANT1',
          sklad: 'code:WHMAIN',
          mnozstvi: 2,
          polObch: '',
        },
      ],
    })
    assert.equal(row.operation, 'CONFLICT')
    assert.deepEqual(row.matchingIds, ['1', '2'])
  })

  it('ignores other company and order-linked reservations', () => {
    const [row] = previewReservationSync({
      ...base,
      lines: [{ sku: 'PLANT1', currentQty: 10, freeQty: 8 }],
      existing: [
        {
          id: 'c',
          firma: 'code:OTHER',
          cenik: 'code:PLANT1',
          sklad: 'code:WHMAIN',
          mnozstvi: 99,
          polObch: '',
        },
        {
          id: 'o',
          firma: 'code:RESERVA-DORASTANIE',
          cenik: 'code:PLANT1',
          sklad: 'code:WHMAIN',
          mnozstvi: 1,
          polObch: '123',
        },
      ],
    })
    assert.equal(row.operation, 'CREATE')
    assert.equal(row.desiredQty, 2)
  })

  it('CONFLICT when freeQty > currentQty', () => {
    const [row] = previewReservationSync({
      ...base,
      lines: [{ sku: 'PLANT1', currentQty: 3, freeQty: 5 }],
      existing: [],
    })
    assert.equal(row.operation, 'CONFLICT')
  })
})
