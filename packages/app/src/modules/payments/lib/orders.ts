// Pure rules of a guardian's kit order (payments spec *Domain Vocabulary* → Order; REQ-032, DD-30; issue #116, mockups
// M-16, M-17, M-19): the order lines of the form's answers (the set at its set price, single products at the price of
// their size, "Not ordering"), the answers of stored lines, the print name and number, the numbers taken in a group,
// the order window, a child's state in a campaign, a changed amount against what was paid, and the expiry of a personal
// link. Time is a parameter (engineering standards S3.5); nothing here reads the database.
import type { CalendarDate } from '@vereino/core'
import { unitPrice, type CampaignStatus, type ProductKind } from './order-campaigns'

/** The answer for a product the guardian does not order. */
export const NOT_ORDERING = 'none'
/** The answer for a product without a size the guardian orders. */
export const ORDERING = 'yes'

/** The print name on a kit: at most 12 characters (M-17). */
export const PRINT_NAME_MAX = 12
export const CONTACT_PHONE_MAX = 30
export const ORDER_NOTES_MAX = 500

/** A personal order link lives until the end of the orders deadline, and never longer than this (120 days). */
export const ORDER_LINK_TTL_MS = 120 * 24 * 60 * 60 * 1000

/** At most this many links per guardian and campaign in one hour: a request cannot flood somebody's mailbox. */
export const MAX_ORDER_LINKS_PER_HOUR = 3

export type FormProduct = {
  id: string
  kind: ProductKind
  componentProductIds: readonly string[]
  sizesChild: readonly string[]
  sizesAdult: readonly string[]
  priceChild: number
  priceAdult: number | null
  requiredAnswer: boolean
}

export type OrderLineDraft = {
  productId: string
  size: string | null
  /** A set's sizes by component product id. */
  componentSizes: Record<string, string> | null
  unitPrice: number
}

export type OrderAnswers = {
  setSelected: boolean
  /** Product id → a size, `none` ("Not ordering") or `yes` (a product without a size). */
  choices: Readonly<Record<string, string>>
}

export type OrderLinesError = 'order_answer_missing' | 'order_answer_invalid' | 'order_set_size_missing' | 'order_empty'

export type OrderLinesResult =
  { ok: true; lines: OrderLineDraft[]; total: number } | { ok: false; error: OrderLinesError; productId: string | null }

function sizesOf(product: FormProduct): string[] {
  return [...product.sizesChild, ...product.sizesAdult]
}

/**
 * The lines of an order from the form's answers. With the set selected, its products are ordered in it — each with a
 * size when it has sizes — at the set price, and are not ordered again on their own. Every other single product needs
 * an answer when its answer is required ("Not ordering" counts); an answer must be one of its sizes, or `yes` for a
 * product without a size. An answer for an unknown product, or the set selected when the campaign has none, is
 * invalid. At least one line.
 */
export function orderLines(products: readonly FormProduct[], answers: OrderAnswers): OrderLinesResult {
  const byId = new Map(products.map((product) => [product.id, product]))
  const unknown = Object.keys(answers.choices).find((id) => !byId.has(id) || byId.get(id)?.kind === 'set')
  if (unknown) return { ok: false, error: 'order_answer_invalid', productId: unknown }
  const set = products.find((product) => product.kind === 'set')
  const lines: OrderLineDraft[] = []
  const inSet = new Set<string>()
  if (answers.setSelected) {
    if (!set) return { ok: false, error: 'order_answer_invalid', productId: null }
    const componentSizes: Record<string, string> = {}
    for (const id of set.componentProductIds) {
      inSet.add(id)
      const component = byId.get(id)
      const sizes = component ? sizesOf(component) : []
      if (sizes.length === 0) continue
      const choice = answers.choices[id]
      if (choice === undefined || !sizes.includes(choice)) {
        return { ok: false, error: 'order_set_size_missing', productId: id }
      }
      componentSizes[id] = choice
    }
    lines.push({ productId: set.id, size: null, componentSizes, unitPrice: set.priceChild })
  }
  for (const product of products) {
    if (product.kind === 'set' || inSet.has(product.id)) continue
    const choice = answers.choices[product.id]
    if (choice === undefined) {
      if (product.requiredAnswer) return { ok: false, error: 'order_answer_missing', productId: product.id }
      continue
    }
    if (choice === NOT_ORDERING) continue
    const sizes = sizesOf(product)
    const valid = sizes.length > 0 ? sizes.includes(choice) : choice === ORDERING
    if (!valid) return { ok: false, error: 'order_answer_invalid', productId: product.id }
    const size = sizes.length > 0 ? choice : null
    lines.push({ productId: product.id, size, componentSizes: null, unitPrice: unitPrice(product, size) })
  }
  if (lines.length === 0) return { ok: false, error: 'order_empty', productId: null }
  return { ok: true, lines, total: lines.reduce((sum, line) => sum + line.unitPrice, 0) }
}

/**
 * The form's answers of stored lines (changing an order): a set line selects the set and gives its products' sizes,
 * a single line its size (or `yes`), and every other single product is "Not ordering".
 */
export function answersOfLines(
  products: readonly Pick<FormProduct, 'id' | 'kind' | 'componentProductIds'>[],
  lines: readonly Pick<OrderLineDraft, 'productId' | 'size' | 'componentSizes'>[],
): OrderAnswers {
  const byId = new Map(products.map((product) => [product.id, product]))
  const single: Record<string, string> = {}
  const setSizes: Record<string, string> = {}
  const inSet = new Set<string>()
  let setSelected = false
  for (const product of products) if (product.kind === 'item') single[product.id] = NOT_ORDERING
  for (const line of lines) {
    const product = byId.get(line.productId)
    if (product?.kind === 'set') {
      setSelected = true
      for (const id of product.componentProductIds) inSet.add(id)
      Object.assign(setSizes, line.componentSizes ?? {})
    } else if (product) {
      single[line.productId] = line.size ?? ORDERING
    }
  }
  // A product of the set answers with its size in the set; one without a size has no answer of its own.
  const own = Object.entries(single).filter(([id]) => !inSet.has(id))
  return { setSelected, choices: { ...Object.fromEntries(own), ...setSizes } }
}

/** The default print name: the child's first name in capitals, cut to the print limit. */
export function defaultPrintName(firstName: string): string {
  return firstName.trim().toLocaleUpperCase('pl').slice(0, PRINT_NAME_MAX)
}

/** A print name as stored: trimmed, in capitals; null when blank. */
export function normalizePrintName(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed ? trimmed.toLocaleUpperCase('pl') : null
}

export type PrintHolder = { participantPersonId: string; printNumber: number | null; groupId: string | null }

/** The order that already holds `number` in `groupId`, other than the child's own; null when it is free. */
export function numberHolder<T extends PrintHolder>(
  orders: readonly T[],
  groupId: string | null,
  number: number,
  participantPersonId: string,
): T | null {
  return (
    orders.find(
      (order) =>
        order.groupId === groupId && order.printNumber === number && order.participantPersonId !== participantPersonId,
    ) ?? null
  )
}

/** The numbers taken in a group by other children's orders, ascending (M-17 lists them). */
export function takenNumbers(orders: readonly PrintHolder[], groupId: string, participantPersonId: string): number[] {
  return [
    ...new Set(
      orders
        .filter((order) => order.groupId === groupId && order.participantPersonId !== participantPersonId)
        .flatMap((order) => (order.printNumber === null ? [] : [order.printNumber])),
    ),
  ].sort((a, b) => a - b)
}

/** Orders may be placed, changed or cancelled while the campaign collects and its deadline has not passed. */
export function ordersOpen(campaign: { status: CampaignStatus; closesOn: CalendarDate }, today: CalendarDate): boolean {
  return campaign.status === 'open' && today <= campaign.closesOn
}

/** A child's state in a campaign (M-16). */
export type ChildOrderState = 'not_ordered' | 'to_pay' | 'paid' | 'picked_up'

export function childOrderState(order: { chargeStatus: string | null; handedOver: boolean } | null): ChildOrderState {
  if (!order) return 'not_ordered'
  if (order.handedOver) return 'picked_up'
  return order.chargeStatus === 'paid' ? 'paid' : 'to_pay'
}

/** A changed order may not cost less than what was already paid on it. */
export function belowPaid(total: number, paid: number): boolean {
  return total < paid
}

/** An address compared the way people type it: surrounding blanks and letter case do not matter. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/** The persons whose address is `email` (two guardians may share one). */
export function personIdsWithEmail(
  contacts: ReadonlyArray<{ readonly personId: string; readonly email: string | null }>,
  email: string,
): string[] {
  const wanted = normalizeEmail(email)
  if (wanted.length === 0) return []
  return contacts
    .filter((contact) => contact.email !== null && normalizeEmail(contact.email) === wanted)
    .map((contact) => contact.personId)
}

/** The offset of `timeZone` from UTC at `instant`, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const value = (type: string) => Number(byType[type])
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  )
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/** The instant the calendar day `date` ends in `timeZone` (midnight of the next day there). */
export function endOfDayInZone(date: CalendarDate, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const guess = Date.UTC(year, month - 1, day + 1)
  const first = guess - zoneOffsetMs(new Date(guess), timeZone)
  return new Date(guess - zoneOffsetMs(new Date(first), timeZone))
}

/**
 * The expiry of a new personal link: the end of the orders deadline in the club's zone, or `now` plus the time to live
 * when that is earlier; null when the deadline has passed (no link is issued).
 */
export function orderLinkExpiry(
  now: Date,
  closesOn: CalendarDate,
  timeZone: string,
  ttlMs: number = ORDER_LINK_TTL_MS,
): Date | null {
  const end = endOfDayInZone(closesOn, timeZone)
  if (end.getTime() <= now.getTime()) return null
  return new Date(Math.min(end.getTime(), now.getTime() + ttlMs))
}

/** The guardian's personal order page from an e-mail (M-19). */
export function orderLinkPath(rawToken: string): string {
  return `/club/o/${encodeURIComponent(rawToken)}`
}

/**
 * The campaign's order page (M-17) as the share text and the e-mails link to it; with the club's public slug, a
 * guardian without a session can ask for a personal link there.
 */
export function orderPagePath(campaignId: string, clubSlug: string | null): string {
  const path = `/club/orders/${encodeURIComponent(campaignId)}`
  return clubSlug ? `${path}?club=${encodeURIComponent(clubSlug)}` : path
}
