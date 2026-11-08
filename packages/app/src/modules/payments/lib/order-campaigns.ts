// Pure rules of order campaigns (payments spec *Domain Vocabulary* → Order campaign, Order; REQ-032, DD-30; issue
// #115, mockups B-30…B-32): the stages and their one "next" action, the form limits, the deadlines, the set of
// products, the price of a size, the supplier summary (units per product and size, prints) with its CSV, the KPIs and
// the product drafts a copied campaign starts from. Time is a parameter (engineering standards S3.5); nothing here
// reads the database.
import type { CalendarDate } from '@vereino/core'

/** `draft` → `open` (collecting) → `closed` → `ordered` (from the supplier) → `delivered` → `completed`. */
export const CAMPAIGN_STATUSES = ['draft', 'open', 'closed', 'ordered', 'delivered', 'completed'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

/** The transition routes `/api/payments/order-campaigns/{id}/<action>`, one per stage. */
export const CAMPAIGN_ACTIONS = ['open', 'close', 'mark-ordered', 'mark-delivered', 'complete'] as const
export type CampaignAction = (typeof CAMPAIGN_ACTIONS)[number]

const TRANSITIONS: Record<CampaignAction, { from: CampaignStatus; to: CampaignStatus }> = {
  open: { from: 'draft', to: 'open' },
  close: { from: 'open', to: 'closed' },
  'mark-ordered': { from: 'closed', to: 'ordered' },
  'mark-delivered': { from: 'ordered', to: 'delivered' },
  complete: { from: 'delivered', to: 'completed' },
}

/** The status `action` leads to from `status`, or null when it is out of order (409). */
export function transitionTarget(action: CampaignAction, status: CampaignStatus): CampaignStatus | null {
  const transition = TRANSITIONS[action]
  return transition.from === status ? transition.to : null
}

/** The one "next" action of a stage (B-32), or null for a completed campaign. */
export function nextAction(status: CampaignStatus): CampaignAction | null {
  return CAMPAIGN_ACTIONS.find((action) => TRANSITIONS[action].from === status) ?? null
}

/** The form is editable only while the campaign is a draft or collecting orders. */
export function isCampaignEditable(status: CampaignStatus): boolean {
  return status === 'draft' || status === 'open'
}

/** An order is `submitted` until the guardian cancels it (E07-S09). */
export const ORDER_STATUSES = ['submitted', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** A single product, or the set of several products at a set price. */
export const PRODUCT_KINDS = ['item', 'set'] as const
export type ProductKind = (typeof PRODUCT_KINDS)[number]

export const CAMPAIGN_NAME_MIN = 3
export const CAMPAIGN_NAME_MAX = 120
export const CAMPAIGN_DESCRIPTION_MAX = 1000
export const CAMPAIGN_TEXT_MAX = 200
export const MAX_CAMPAIGN_GROUPS = 100
export const MAX_CAMPAIGN_PRODUCTS = 30
export const PRODUCT_NAME_MAX = 120
export const MAX_PRODUCT_SIZES = 20
export const SIZE_MAX = 20
/** The print number on a kit: 1–99, unique within the group in the campaign. */
export const PRINT_NUMBER_MIN = 1
export const PRINT_NUMBER_MAX = 99

export type CampaignDateError = 'closes_on_past' | 'payment_due_before_close'

/**
 * The field errors of the deadlines: the orders deadline not before today (checked when it is set or changed), the
 * payment deadline not before the orders deadline.
 */
export function campaignDateErrors(
  dates: { closesOn: CalendarDate; paymentDueOn: CalendarDate },
  today: CalendarDate,
  checkPast: boolean,
): Partial<Record<'closesOn' | 'paymentDueOn', CampaignDateError>> {
  const errors: Partial<Record<'closesOn' | 'paymentDueOn', CampaignDateError>> = {}
  if (checkPast && dates.closesOn < today) errors.closesOn = 'closes_on_past'
  if (dates.paymentDueOn < dates.closesOn) errors.paymentDueOn = 'payment_due_before_close'
  return errors
}

/** A product as the form sends it: `key` is its id when it exists, any unique text otherwise. */
export type ProductDraft = {
  key: string
  kind: ProductKind
  /** The keys of a set's products. */
  componentKeys: readonly string[]
  sizesAdult: readonly string[]
  priceAdult: number | null
}

export type ProductSetError = 'set_too_many' | 'set_too_small' | 'set_component_invalid' | 'adult_price_missing'

/**
 * The first rule the products break, or null: at most one set; a set of at least two different single products of
 * the same campaign; an adult price for a product with adult sizes.
 */
export function productsError(products: readonly ProductDraft[]): ProductSetError | null {
  const sets = products.filter((product) => product.kind === 'set')
  if (sets.length > 1) return 'set_too_many'
  const items = new Set(products.filter((product) => product.kind === 'item').map((product) => product.key))
  for (const set of sets) {
    if (new Set(set.componentKeys).size < 2) return 'set_too_small'
    if (set.componentKeys.some((key) => !items.has(key))) return 'set_component_invalid'
  }
  if (products.some((product) => product.sizesAdult.length > 0 && product.priceAdult === null)) {
    return 'adult_price_missing'
  }
  return null
}

/** The price of one product in `size`: the adult price for an adult size, the children's price otherwise. */
export function unitPrice(
  product: { sizesAdult: readonly string[]; priceChild: number; priceAdult: number | null },
  size: string | null,
): number {
  if (size !== null && product.priceAdult !== null && product.sizesAdult.includes(size)) return product.priceAdult
  return product.priceChild
}

/** The products a removal from the form would delete (existing ids no longer sent). */
export function removedProductIds(existingIds: readonly string[], keptKeys: readonly string[]): string[] {
  const kept = new Set(keptKeys)
  return existingIds.filter((id) => !kept.has(id))
}

export type SummaryProduct = {
  id: string
  name: string
  kind: ProductKind
  componentProductIds: readonly string[]
  sizesChild: readonly string[]
  sizesAdult: readonly string[]
  sort: number
}

export type SummaryOrderLine = {
  productId: string
  size: string | null
  /** A set's sizes by component product id. */
  componentSizes: Readonly<Record<string, string>> | null
}

export type SummaryOrder = {
  printName: string | null
  printNumber: number | null
  groupName: string | null
  lines: readonly SummaryOrderLine[]
}

export type SummaryUnit = { productId: string; productName: string; size: string | null; quantity: number }
export type SummaryPrint = {
  printName: string | null
  printNumber: number | null
  groupName: string | null
  sizes: { productName: string; size: string | null }[]
}
export type SupplierSummary = { units: SummaryUnit[]; prints: SummaryPrint[] }

/** The single products and sizes a line stands for: a set counts under each of its products. */
function expandLine(
  line: SummaryOrderLine,
  products: ReadonlyMap<string, SummaryProduct>,
): { product: SummaryProduct; size: string | null }[] {
  const product = products.get(line.productId)
  if (!product) return []
  if (product.kind === 'item') return [{ product, size: line.size }]
  return product.componentProductIds.flatMap((id) => {
    const component = products.get(id)
    return component ? [{ product: component, size: line.componentSizes?.[id] ?? null }] : []
  })
}

function sizeRank(product: SummaryProduct, size: string | null): number {
  const sizes = [...product.sizesChild, ...product.sizesAdult]
  const index = size === null ? -1 : sizes.indexOf(size)
  return index === -1 ? sizes.length : index
}

/**
 * The supplier summary (B-32): units per product and size (set items counted under their products), in the form's
 * product and size order, and the print rows — print name, number, group and sizes — of the orders that ask for one.
 * No contact details and no full names (Q1, data minimisation).
 */
export function supplierSummary(products: readonly SummaryProduct[], orders: readonly SummaryOrder[]): SupplierSummary {
  const byId = new Map(products.map((product) => [product.id, product]))
  const units = new Map<string, SummaryUnit & { product: SummaryProduct }>()
  const prints: SummaryPrint[] = []
  for (const order of orders) {
    const expanded = order.lines.flatMap((line) => expandLine(line, byId))
    for (const { product, size } of expanded) {
      const key = `${product.id}\u0000${size ?? ''}`
      const unit = units.get(key)
      if (unit) unit.quantity += 1
      else units.set(key, { product, productId: product.id, productName: product.name, size, quantity: 1 })
    }
    if (order.printName || order.printNumber !== null) {
      prints.push({
        printName: order.printName,
        printNumber: order.printNumber,
        groupName: order.groupName,
        sizes: expanded.map(({ product, size }) => ({ productName: product.name, size })),
      })
    }
  }
  const sortedUnits = [...units.values()]
    .sort((a, b) => a.product.sort - b.product.sort || sizeRank(a.product, a.size) - sizeRank(b.product, b.size))
    .map((unit) => ({
      productId: unit.productId,
      productName: unit.productName,
      size: unit.size,
      quantity: unit.quantity,
    }))
  prints.sort(
    (a, b) =>
      (a.groupName ?? '').localeCompare(b.groupName ?? '') ||
      (a.printNumber ?? PRINT_NUMBER_MAX + 1) - (b.printNumber ?? PRINT_NUMBER_MAX + 1),
  )
  return { units: sortedUnits, prints }
}

/** One CSV field, quoted when it holds a separator, a quote or a line break; a formula prefix is neutralized. */
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export type SummaryCsvLabels = {
  product: string
  size: string
  quantity: string
  printName: string
  printNumber: string
  group: string
  sizes: string
}

/**
 * The supplier summary as CSV: the units block (product, size, quantity), an empty line, then the prints block
 * (print name, number, group, sizes as `product: size` joined by `; `). CRLF line ends.
 */
export function supplierSummaryCsv(summary: SupplierSummary, labels: SummaryCsvLabels): string {
  const units = summary.units.map((unit) =>
    [csvField(unit.productName), csvField(unit.size ?? ''), String(unit.quantity)].join(','),
  )
  const prints = summary.prints.map((print) =>
    [
      csvField(print.printName ?? ''),
      print.printNumber === null ? '' : String(print.printNumber),
      csvField(print.groupName ?? ''),
      csvField(
        print.sizes.map((entry) => (entry.size ? `${entry.productName}: ${entry.size}` : entry.productName)).join('; '),
      ),
    ].join(','),
  )
  const lines = [
    [labels.product, labels.size, labels.quantity].map(csvField).join(','),
    ...units,
    '',
    [labels.printName, labels.printNumber, labels.group, labels.sizes].map(csvField).join(','),
    ...prints,
  ]
  return lines.join('\r\n') + '\r\n'
}

export type CampaignKpis = {
  orders: number
  children: number
  missing: number
  value: number
  paid: number
  handedOver: number
}

/** The B-30/B-32 KPIs: orders out of children, the value and what was paid (grosz), the kits handed over. */
export function campaignKpis(
  children: number,
  orders: readonly { total: number; paid: number; handedOver: boolean }[],
): CampaignKpis {
  return {
    orders: orders.length,
    children,
    missing: Math.max(children - orders.length, 0),
    value: orders.reduce((sum, order) => sum + order.total, 0),
    paid: orders.reduce((sum, order) => sum + order.paid, 0),
    handedOver: orders.filter((order) => order.handedOver).length,
  }
}

/** A stored product as the form's draft, keyed by its id (editing, or the copy of an earlier campaign). */
export type ProductRecord = {
  id: string
  name: string
  kind: ProductKind
  componentProductIds: readonly string[]
  sizesChild: readonly string[]
  sizesAdult: readonly string[]
  priceChild: number
  priceAdult: number | null
  requiredAnswer: boolean
}

export type ProductFormDraft = Omit<ProductRecord, 'id' | 'componentProductIds'> & {
  key: string
  componentKeys: string[]
  /** Set only when editing: the stored product the draft changes. */
  id?: string
}

/**
 * The form drafts of stored products. `copy` drops the ids, so saving creates new products (the copy of an earlier
 * campaign); the keys still tie a set to its products.
 */
export function productDrafts(products: readonly ProductRecord[], copy: boolean): ProductFormDraft[] {
  return products.map((product) => ({
    ...(copy ? {} : { id: product.id }),
    key: copy ? `copy-${product.id}` : product.id,
    name: product.name,
    kind: product.kind,
    componentKeys: product.componentProductIds.map((id) => (copy ? `copy-${id}` : id)),
    sizesChild: Array.from(product.sizesChild),
    sizesAdult: Array.from(product.sizesAdult),
    priceChild: product.priceChild,
    priceAdult: product.priceAdult,
    requiredAnswer: product.requiredAnswer,
  }))
}
