import { describe, expect, it } from '@jest/globals'
import {
  ORDER_LINK_TTL_MS,
  answersOfLines,
  belowPaid,
  childOrderState,
  defaultPrintName,
  endOfDayInZone,
  normalizeEmail,
  normalizePrintName,
  numberHolder,
  orderLines,
  orderLinkExpiry,
  orderLinkPath,
  orderPagePath,
  ordersOpen,
  personIdsWithEmail,
  takenNumbers,
  type FormProduct,
} from '../orders'

const shirt: FormProduct = {
  id: 'shirt',
  kind: 'item',
  componentProductIds: [],
  sizesChild: ['116', '128'],
  sizesAdult: ['S', 'M'],
  priceChild: 6000,
  priceAdult: 7000,
  requiredAnswer: true,
}
const shorts: FormProduct = { ...shirt, id: 'shorts', priceChild: 4000, priceAdult: 4500 }
const socks: FormProduct = {
  id: 'socks',
  kind: 'item',
  componentProductIds: [],
  sizesChild: [],
  sizesAdult: [],
  priceChild: 1500,
  priceAdult: null,
  requiredAnswer: false,
}
const bag: FormProduct = { ...socks, id: 'bag', priceChild: 5000, requiredAnswer: true }
const set: FormProduct = {
  id: 'set',
  kind: 'set',
  componentProductIds: ['shirt', 'shorts', 'socks'],
  sizesChild: [],
  sizesAdult: [],
  priceChild: 9000,
  priceAdult: null,
  requiredAnswer: false,
}
const products = [shirt, shorts, socks, bag, set]

describe('orderLines', () => {
  it('orders the set at its set price with its products sizes, and the rest on their own', () => {
    const result = orderLines(products, {
      setSelected: true,
      choices: { shirt: '128', shorts: 'M', bag: 'yes' },
    })
    expect(result).toEqual({
      ok: true,
      lines: [
        { productId: 'set', size: null, componentSizes: { shirt: '128', shorts: 'M' }, unitPrice: 9000 },
        { productId: 'bag', size: null, componentSizes: null, unitPrice: 5000 },
      ],
      total: 14000,
    })
  })

  it('prices single products by size, adult sizes at the adult price, and skips "Not ordering"', () => {
    const result = orderLines(products, {
      setSelected: false,
      choices: { shirt: 'S', shorts: 'none', socks: 'yes', bag: 'none' },
    })
    expect(result).toEqual({
      ok: true,
      lines: [
        { productId: 'shirt', size: 'S', componentSizes: null, unitPrice: 7000 },
        { productId: 'socks', size: null, componentSizes: null, unitPrice: 1500 },
      ],
      total: 8500,
    })
  })

  it('refuses a missing required answer, an invalid answer and an unknown product', () => {
    expect(orderLines(products, { setSelected: false, choices: { shorts: 'none', bag: 'none' } })).toEqual({
      ok: false,
      error: 'order_answer_missing',
      productId: 'shirt',
    })
    expect(
      orderLines(products, { setSelected: false, choices: { shirt: 'XXL', shorts: 'none', bag: 'none' } }),
    ).toEqual({ ok: false, error: 'order_answer_invalid', productId: 'shirt' })
    expect(
      orderLines(products, { setSelected: false, choices: { shirt: 'none', shorts: 'none', bag: 'maybe' } }),
    ).toEqual({ ok: false, error: 'order_answer_invalid', productId: 'bag' })
    expect(orderLines(products, { setSelected: false, choices: { ghost: 'yes' } })).toEqual({
      ok: false,
      error: 'order_answer_invalid',
      productId: 'ghost',
    })
    expect(orderLines(products, { setSelected: true, choices: { set: 'yes' } })).toEqual({
      ok: false,
      error: 'order_answer_invalid',
      productId: 'set',
    })
  })

  it('refuses the set without a size and a set the campaign does not have', () => {
    expect(orderLines(products, { setSelected: true, choices: { shirt: '128', bag: 'none' } })).toEqual({
      ok: false,
      error: 'order_set_size_missing',
      productId: 'shorts',
    })
    expect(orderLines(products, { setSelected: true, choices: { shirt: 'none', shorts: 'M', bag: 'none' } })).toEqual({
      ok: false,
      error: 'order_set_size_missing',
      productId: 'shirt',
    })
    expect(orderLines([shirt], { setSelected: true, choices: {} })).toEqual({
      ok: false,
      error: 'order_answer_invalid',
      productId: null,
    })
  })

  it('skips a set product that no longer exists, and refuses an empty order', () => {
    const ghostSet: FormProduct = { ...set, componentProductIds: ['socks', 'gone'] }
    expect(orderLines([socks, ghostSet], { setSelected: true, choices: {} })).toMatchObject({
      ok: true,
      lines: [{ productId: 'set', componentSizes: {} }],
    })
    expect(
      orderLines(products, { setSelected: false, choices: { shirt: 'none', shorts: 'none', bag: 'none' } }),
    ).toEqual({ ok: false, error: 'order_empty', productId: null })
  })
})

describe('answersOfLines', () => {
  it('rebuilds the set and the single answers of stored lines', () => {
    expect(
      answersOfLines(products, [
        { productId: 'set', size: null, componentSizes: { shirt: '128', shorts: 'M' } },
        { productId: 'bag', size: null, componentSizes: null },
        { productId: 'gone', size: 'M', componentSizes: null },
      ]),
    ).toEqual({ setSelected: true, choices: { shirt: '128', shorts: 'M', bag: 'yes' } })
  })

  it('answers "Not ordering" for every single product without a line', () => {
    expect(
      answersOfLines(products, [
        { productId: 'shirt', size: 'S', componentSizes: null },
        { productId: 'set', size: null, componentSizes: null },
      ]),
    ).toEqual({ setSelected: true, choices: { bag: 'none' } })
    expect(answersOfLines([shirt, socks], [{ productId: 'shirt', size: '116', componentSizes: null }])).toEqual({
      setSelected: false,
      choices: { shirt: '116', socks: 'none' },
    })
  })
})

describe('print', () => {
  it('defaults to the first name in capitals within 12 characters', () => {
    expect(defaultPrintName(' Jaś ')).toBe('JAŚ')
    expect(defaultPrintName('Maksymilianowski')).toBe('MAKSYMILIANO')
  })

  it('stores a print name in capitals, or null when blank', () => {
    expect(normalizePrintName(' jaś ')).toBe('JAŚ')
    expect(normalizePrintName('  ')).toBeNull()
    expect(normalizePrintName(null)).toBeNull()
    expect(normalizePrintName(undefined)).toBeNull()
  })

  const orders = [
    { participantPersonId: 'ola', printNumber: 8, groupId: 'zaki' },
    { participantPersonId: 'jas', printNumber: 7, groupId: 'zaki' },
    { participantPersonId: 'ada', printNumber: 8, groupId: 'orliki' },
    { participantPersonId: 'tom', printNumber: null, groupId: 'zaki' },
    { participantPersonId: 'max', printNumber: 3, groupId: 'zaki' },
    { participantPersonId: 'max2', printNumber: 3, groupId: 'zaki' },
  ]

  it('finds who holds a number in the group, never the child itself', () => {
    expect(numberHolder(orders, 'zaki', 8, 'jas')?.participantPersonId).toBe('ola')
    expect(numberHolder(orders, 'zaki', 7, 'jas')).toBeNull()
    expect(numberHolder(orders, 'orliki', 7, 'jas')).toBeNull()
  })

  it('lists the numbers other children took in a group, once and ascending', () => {
    expect(takenNumbers(orders, 'zaki', 'jas')).toEqual([3, 8])
    expect(takenNumbers(orders, 'orliki', 'ada')).toEqual([])
  })
})

describe('order window and state', () => {
  it('is open while collecting until the end of the deadline', () => {
    expect(ordersOpen({ status: 'open', closesOn: '2026-11-20' }, '2026-11-20')).toBe(true)
    expect(ordersOpen({ status: 'open', closesOn: '2026-11-20' }, '2026-11-21')).toBe(false)
    expect(ordersOpen({ status: 'closed', closesOn: '2026-11-20' }, '2026-11-10')).toBe(false)
  })

  it('names a child state per campaign (M-16)', () => {
    expect(childOrderState(null)).toBe('not_ordered')
    expect(childOrderState({ chargeStatus: 'open', handedOver: false })).toBe('to_pay')
    expect(childOrderState({ chargeStatus: 'partially_paid', handedOver: false })).toBe('to_pay')
    expect(childOrderState({ chargeStatus: 'paid', handedOver: false })).toBe('paid')
    expect(childOrderState({ chargeStatus: 'open', handedOver: true })).toBe('picked_up')
  })

  it('refuses a total below what was paid', () => {
    expect(belowPaid(9000, 9000)).toBe(false)
    expect(belowPaid(8999, 9000)).toBe(true)
  })
})

describe('link request', () => {
  it('compares addresses without case and blanks', () => {
    expect(normalizeEmail('  Kasia@Example.ORG ')).toBe('kasia@example.org')
    const contacts = [
      { personId: 'kasia', email: 'kasia@example.org' },
      { personId: 'piotr', email: null },
      { personId: 'tata', email: 'KASIA@example.org' },
    ]
    expect(personIdsWithEmail(contacts, ' Kasia@example.org')).toEqual(['kasia', 'tata'])
    expect(personIdsWithEmail(contacts, '   ')).toEqual([])
  })

  it('ends a day at the next midnight of the zone, summer and winter', () => {
    expect(endOfDayInZone('2026-07-10', 'Europe/Warsaw').toISOString()).toBe('2026-07-10T22:00:00.000Z')
    expect(endOfDayInZone('2026-11-20', 'Europe/Warsaw').toISOString()).toBe('2026-11-20T23:00:00.000Z')
    expect(endOfDayInZone('2026-03-28', 'Europe/Warsaw').toISOString()).toBe('2026-03-28T23:00:00.000Z')
    expect(endOfDayInZone('2026-11-20', 'UTC').toISOString()).toBe('2026-11-21T00:00:00.000Z')
  })

  it('lives until the end of the deadline, at most the time to live, and is not issued after it', () => {
    const now = new Date('2026-11-10T12:00:00.000Z')
    expect(orderLinkExpiry(now, '2026-11-20', 'Europe/Warsaw')?.toISOString()).toBe('2026-11-20T23:00:00.000Z')
    expect(orderLinkExpiry(now, '2027-12-20', 'Europe/Warsaw')?.getTime()).toBe(now.getTime() + ORDER_LINK_TTL_MS)
    expect(orderLinkExpiry(now, '2026-11-09', 'Europe/Warsaw')).toBeNull()
  })
})

describe('paths', () => {
  it('links the personal page by token and the campaign page with the club slug', () => {
    expect(orderLinkPath('ab/c')).toBe('/club/o/ab%2Fc')
    expect(orderPagePath('c1', 'klub fc')).toBe('/club/orders/c1?club=klub%20fc')
    expect(orderPagePath('c1', null)).toBe('/club/orders/c1')
  })
})
