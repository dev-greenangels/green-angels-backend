import {
  assignInvoiceLineBatches,
  detectBatchGroupHeader,
  parseFooterBatchNumbers,
} from './invoice-batch-assign'

describe('parseFooterBatchNumbers', () => {
  it('parses comma-separated Vitroflora footer batches', () => {
    expect(
      parseFooterBatchNumbers(['No. batch: 699749,699750,699757,700499']),
    ).toEqual(['699749', '699750', '699757', '700499'])
  })

  it('parses single batch', () => {
    expect(parseFooterBatchNumbers(['No. batch: 701609'])).toEqual(['701609'])
  })
})

describe('assignInvoiceLineBatches', () => {
  it('assigns one footer batch to all product lines', () => {
    const out = assignInvoiceLineBatches(
      [
        {
          lineIndex: 0,
          rawName: 'Achillea',
          sku: '1-75502-02',
          quantity: 100,
          unitPrice: 0.52,
          lineTotal: 52,
        },
      ],
      ['No. batch: 701609'],
    )
    expect(out).toHaveLength(1)
    expect(out[0].batchNumber).toBe('701609')
  })

  it('uses group headers for multi-batch Vitroflora invoice', () => {
    const out = assignInvoiceLineBatches(
      [
        { lineIndex: 0, rawName: '699749', quantity: 0, unitPrice: 0 },
        {
          lineIndex: 1,
          rawName: 'Achillea',
          sku: '1-75496-02',
          quantity: 200,
          unitPrice: 0.52,
        },
        { lineIndex: 2, rawName: '699750', quantity: 0, unitPrice: 0 },
        {
          lineIndex: 3,
          rawName: 'Brunnera',
          sku: '1-71830-01',
          quantity: 168,
          unitPrice: 1.04,
        },
        {
          lineIndex: 4,
          rawName: 'BOXES',
          sku: 'BOX-0',
          quantity: 74,
          unitPrice: 0.37,
        },
      ],
      ['No. batch: 699749,699750'],
    )
    expect(out).toHaveLength(3)
    expect(out[0].batchNumber).toBe('699749')
    expect(out[1].batchNumber).toBe('699750')
    expect(out[2].batchNumber).toBeUndefined()
  })
})

describe('detectBatchGroupHeader', () => {
  it('detects standalone 6-digit header row', () => {
    expect(
      detectBatchGroupHeader({
        lineIndex: 0,
        rawName: '699749',
        quantity: 0,
        unitPrice: 0,
      }),
    ).toBe('699749')
  })

  it('does not treat product index as header', () => {
    expect(
      detectBatchGroupHeader({
        lineIndex: 0,
        rawName: 'Achillea',
        sku: '1-75496-02',
        quantity: 200,
        unitPrice: 0.52,
      }),
    ).toBeNull()
  })
})
