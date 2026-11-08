import { describe, expect, it } from '@jest/globals'
import {
  CAMPAIGN_ACTIONS,
  CAMPAIGN_STATUSES,
  campaignDateErrors,
  campaignKpis,
  isCampaignEditable,
  nextAction,
  productDrafts,
  productsError,
  removedProductIds,
  supplierSummary,
  supplierSummaryCsv,
  transitionTarget,
  unitPrice,
  type ProductDraft,
  type ProductRecord,
  type SummaryProduct,
} from '../order-campaigns'

describe('campaign stages', () => {
  it('moves one stage forward per action and refuses every other pair', () => {
    expect(transitionTarget('open', 'draft')).toBe('open')
    expect(transitionTarget('close', 'open')).toBe('closed')
    expect(transitionTarget('mark-ordered', 'closed')).toBe('ordered')
    expect(transitionTarget('mark-delivered', 'ordered')).toBe('delivered')
    expect(transitionTarget('complete', 'delivered')).toBe('completed')
    const allowed = CAMPAIGN_ACTIONS.flatMap((action) =>
      CAMPAIGN_STATUSES.filter((status) => transitionTarget(action, status) !== null).map((s) => `${action}:${s}`),
    )
    expect(allowed).toEqual([
      'open:draft',
      'close:open',
      'mark-ordered:closed',
      'mark-delivered:ordered',
      'complete:delivered',
    ])
  })

  it('offers one next action per stage and none once completed', () => {
    expect(CAMPAIGN_STATUSES.map(nextAction)).toEqual([
      'open',
      'close',
      'mark-ordered',
      'mark-delivered',
      'complete',
      null,
    ])
  })

  it('keeps the form editable only while drafting or collecting', () => {
    expect(CAMPAIGN_STATUSES.filter(isCampaignEditable)).toEqual(['draft', 'open'])
  })
})

describe('campaignDateErrors', () => {
  it('accepts deadlines from today with the payment on or after the orders deadline', () => {
    expect(campaignDateErrors({ closesOn: '2026-11-08', paymentDueOn: '2026-11-08' }, '2026-11-08', true)).toEqual({})
  })

  it('refuses an orders deadline in the past only when asked to check it', () => {
    const dates = { closesOn: '2026-11-07', paymentDueOn: '2026-11-20' }
    expect(campaignDateErrors(dates, '2026-11-08', true)).toEqual({ closesOn: 'closes_on_past' })
    expect(campaignDateErrors(dates, '2026-11-08', false)).toEqual({})
  })

  it('refuses a payment deadline before the orders deadline', () => {
    expect(campaignDateErrors({ closesOn: '2026-11-20', paymentDueOn: '2026-11-19' }, '2026-11-08', true)).toEqual({
      paymentDueOn: 'payment_due_before_close',
    })
  })
})

const item = (key: string, adult: Partial<ProductDraft> = {}): ProductDraft => ({
  key,
  kind: 'item',
  componentKeys: [],
  sizesAdult: [],
  priceAdult: null,
  ...adult,
})
const set = (componentKeys: string[]): ProductDraft => ({ ...item('set'), kind: 'set', componentKeys })

describe('productsError', () => {
  it('accepts single products and one set of two or more of them', () => {
    expect(productsError([item('a'), item('b'), set(['a', 'b'])])).toBeNull()
    expect(productsError([])).toBeNull()
  })

  it('refuses a second set', () => {
    expect(productsError([item('a'), item('b'), set(['a', 'b']), { ...set(['a', 'b']), key: 'set2' }])).toBe(
      'set_too_many',
    )
  })

  it('refuses a set of fewer than two different products', () => {
    expect(productsError([item('a'), set(['a', 'a'])])).toBe('set_too_small')
    expect(productsError([item('a'), set(['a'])])).toBe('set_too_small')
  })

  it('refuses a set naming something that is not a single product of the form', () => {
    expect(productsError([item('a'), set(['a', 'ghost'])])).toBe('set_component_invalid')
    expect(productsError([item('a'), set(['a', 'set'])])).toBe('set_component_invalid')
  })

  it('needs an adult price for adult sizes', () => {
    expect(productsError([item('a', { sizesAdult: ['M'] })])).toBe('adult_price_missing')
    expect(productsError([item('a', { sizesAdult: ['M'], priceAdult: 9000 })])).toBeNull()
  })
})

describe('unitPrice', () => {
  const shirt = { sizesAdult: ['S', 'M'], priceChild: 6000, priceAdult: 7500 }

  it('charges the adult price for an adult size and the children price otherwise', () => {
    expect(unitPrice(shirt, 'M')).toBe(7500)
    expect(unitPrice(shirt, '128')).toBe(6000)
    expect(unitPrice(shirt, null)).toBe(6000)
    expect(unitPrice({ ...shirt, priceAdult: null }, 'M')).toBe(6000)
  })
})

describe('removedProductIds', () => {
  it('lists the stored products the form no longer sends', () => {
    expect(removedProductIds(['a', 'b', 'c'], ['a', 'new-1', 'c'])).toEqual(['b'])
  })
})

const products: SummaryProduct[] = [
  {
    id: 'shirt',
    name: 'Shirt',
    kind: 'item',
    componentProductIds: [],
    sizesChild: ['128', '140'],
    sizesAdult: ['M'],
    sort: 0,
  },
  { id: 'shorts', name: 'Shorts', kind: 'item', componentProductIds: [], sizesChild: ['128'], sizesAdult: [], sort: 1 },
  { id: 'scarf', name: 'Scarf', kind: 'item', componentProductIds: [], sizesChild: [], sizesAdult: [], sort: 2 },
  {
    id: 'kit',
    name: 'Kit',
    kind: 'set',
    componentProductIds: ['shirt', 'shorts', 'gone'],
    sizesChild: [],
    sizesAdult: [],
    sort: 3,
  },
]

describe('supplierSummary', () => {
  it('counts set items under their products, in form and size order, and lists the prints', () => {
    const summary = supplierSummary(products, [
      {
        printName: 'JAŚ',
        printNumber: 7,
        groupName: 'Żaki',
        lines: [{ productId: 'kit', size: null, componentSizes: { shirt: '140', shorts: '128' } }],
      },
      {
        printName: null,
        printNumber: null,
        groupName: 'Orliki',
        lines: [
          { productId: 'shirt', size: 'M', componentSizes: null },
          { productId: 'shirt', size: '140', componentSizes: null },
          { productId: 'scarf', size: null, componentSizes: null },
          { productId: 'unknown', size: null, componentSizes: null },
        ],
      },
      {
        printName: null,
        printNumber: 3,
        groupName: 'Żaki',
        lines: [{ productId: 'kit', size: null, componentSizes: null }],
      },
      {
        printName: 'ADA',
        printNumber: null,
        groupName: null,
        lines: [{ productId: 'shirt', size: 'XXL', componentSizes: null }],
      },
    ])
    expect(summary.units).toEqual([
      { productId: 'shirt', productName: 'Shirt', size: '140', quantity: 2 },
      { productId: 'shirt', productName: 'Shirt', size: 'M', quantity: 1 },
      { productId: 'shirt', productName: 'Shirt', size: null, quantity: 1 },
      { productId: 'shirt', productName: 'Shirt', size: 'XXL', quantity: 1 },
      { productId: 'shorts', productName: 'Shorts', size: '128', quantity: 1 },
      { productId: 'shorts', productName: 'Shorts', size: null, quantity: 1 },
      { productId: 'scarf', productName: 'Scarf', size: null, quantity: 1 },
    ])
    expect(summary.prints).toEqual([
      { printName: 'ADA', printNumber: null, groupName: null, sizes: [{ productName: 'Shirt', size: 'XXL' }] },
      {
        printName: null,
        printNumber: 3,
        groupName: 'Żaki',
        sizes: [
          { productName: 'Shirt', size: null },
          { productName: 'Shorts', size: null },
        ],
      },
      {
        printName: 'JAŚ',
        printNumber: 7,
        groupName: 'Żaki',
        sizes: [
          { productName: 'Shirt', size: '140' },
          { productName: 'Shorts', size: '128' },
        ],
      },
    ])
  })

  it('sorts prints without a number after the numbered ones of a group', () => {
    const summary = supplierSummary(products, [
      { printName: 'B', printNumber: null, groupName: 'Żaki', lines: [] },
      { printName: 'A', printNumber: 9, groupName: 'Żaki', lines: [] },
      { printName: 'C', printNumber: null, groupName: null, lines: [] },
      { printName: 'D', printNumber: 1, groupName: null, lines: [] },
      { printName: 'E', printNumber: null, groupName: 'Żaki', lines: [] },
    ])
    expect(summary.prints.map((print) => print.printName)).toEqual(['D', 'C', 'A', 'B', 'E'])
  })
})

describe('supplierSummaryCsv', () => {
  it('writes the units and the prints blocks with escaped fields', () => {
    const csv = supplierSummaryCsv(
      {
        units: [
          { productId: 'shirt', productName: 'Shirt, home', size: '140', quantity: 2 },
          { productId: 'scarf', productName: '=Scarf', size: null, quantity: 1 },
        ],
        prints: [
          {
            printName: 'JAŚ',
            printNumber: 7,
            groupName: 'Żaki',
            sizes: [
              { productName: 'Shirt', size: '140' },
              { productName: 'Scarf', size: null },
            ],
          },
          { printName: null, printNumber: null, groupName: null, sizes: [] },
        ],
      },
      {
        product: 'Product',
        size: 'Size',
        quantity: 'Quantity',
        printName: 'Print name',
        printNumber: 'Number',
        group: 'Group',
        sizes: 'Sizes "all"',
      },
    )
    expect(csv).toBe(
      [
        'Product,Size,Quantity',
        '"Shirt, home",140,2',
        "'=Scarf,,1",
        '',
        'Print name,Number,Group,"Sizes ""all"""',
        'JAŚ,7,Żaki,Shirt: 140; Scarf',
        ',,,',
        '',
      ].join('\r\n'),
    )
  })
})

describe('campaignKpis', () => {
  it('sums the orders and counts the children still without one', () => {
    expect(
      campaignKpis(5, [
        { total: 15000, paid: 15000, handedOver: true },
        { total: 9000, paid: 0, handedOver: false },
      ]),
    ).toEqual({ orders: 2, children: 5, missing: 3, value: 24000, paid: 15000, handedOver: 1 })
    expect(campaignKpis(0, [{ total: 1, paid: 0, handedOver: false }]).missing).toBe(0)
  })
})

describe('productDrafts', () => {
  const stored: ProductRecord[] = [
    {
      id: 'p1',
      name: 'Shirt',
      kind: 'item',
      componentProductIds: [],
      sizesChild: ['128'],
      sizesAdult: ['M'],
      priceChild: 6000,
      priceAdult: 7500,
      requiredAnswer: true,
    },
    {
      id: 'p2',
      name: 'Kit',
      kind: 'set',
      componentProductIds: ['p1', 'p3'],
      sizesChild: [],
      sizesAdult: [],
      priceChild: 15000,
      priceAdult: null,
      requiredAnswer: false,
    },
  ]

  it('keeps the ids when editing', () => {
    const drafts = productDrafts(stored, false)
    expect(drafts[0]).toEqual({
      id: 'p1',
      key: 'p1',
      name: 'Shirt',
      kind: 'item',
      componentKeys: [],
      sizesChild: ['128'],
      sizesAdult: ['M'],
      priceChild: 6000,
      priceAdult: 7500,
      requiredAnswer: true,
    })
    expect(drafts[1].componentKeys).toEqual(['p1', 'p3'])
  })

  it('drops the ids of a copy and keeps the set tied to its products by key', () => {
    const drafts = productDrafts(stored, true)
    expect(drafts.map((draft) => draft.id)).toEqual([undefined, undefined])
    expect(drafts.map((draft) => draft.key)).toEqual(['copy-p1', 'copy-p2'])
    expect(drafts[1].componentKeys).toEqual(['copy-p1', 'copy-p3'])
  })
})
