// Client pieces of the guardian's kit orders (payments spec REQ-032; M-16, M-17, M-19; issue #116): the response
// shapes of `/api/payments/my-orders`, `/order-campaigns/{id}/form` and `/order-links/{token}`, their query keys, the
// endpoints a form writes to in the app and from a personal link, and the write itself with the order's lock token.
// Authorization stays on the routes and the commands.
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import type { CampaignStatus, ProductKind } from '../../../lib/order-campaigns'
import type { ChildOrderState } from '../../../lib/orders'
import type { TransferInstructions } from '../ClubPaymentsPage'

export const CLUB_ORDERS_HREF = '/club/orders'

export const MY_ORDERS_QUERY_KEY = ['payments-my-orders'] as const

export function orderFormQueryKey(campaignId: string) {
  return ['payments-order-form', campaignId] as const
}

export function orderLinkQueryKey(token: string) {
  return ['payments-order-link', token] as const
}

export function clubOrderHref(campaignId: string, childId?: string): string {
  const path = `${CLUB_ORDERS_HREF}/${encodeURIComponent(campaignId)}`
  return childId ? `${path}?child=${encodeURIComponent(childId)}` : path
}

export type MyCampaignChild = {
  personId: string
  firstName: string
  groupName: string | null
  state: ChildOrderState
  orderId: string | null
  total: number
  remaining: number
}

export type MyCampaign = {
  id: string
  name: string
  description: string | null
  closesOn: string
  paymentDueOn: string
  status: CampaignStatus
  ordersOpen: boolean
  children: MyCampaignChild[]
}

export type FormProductView = {
  id: string
  name: string
  kind: ProductKind
  componentProductIds: string[]
  sizesChild: string[]
  sizesAdult: string[]
  priceChild: number
  priceAdult: number | null
  requiredAnswer: boolean
}

export type FormChild = {
  personId: string
  firstName: string
  lastName: string
  groupId: string
  groupName: string | null
  defaultPrintName: string
  takenNumbers: number[]
}

export type FormOrder = {
  id: string
  participantPersonId: string
  setSelected: boolean
  choices: Record<string, string>
  printName: string | null
  printNumber: number | null
  contactEmail: string | null
  contactPhone: string | null
  notes: string | null
  lines: { productId: string; productName: string; size: string | null; sizes: string | null; unitPrice: number }[]
  total: number
  paid: number
  remaining: number
  chargeId: string
  state: ChildOrderState
  updatedAt: string
}

export type OrderForm = {
  campaign: {
    id: string
    name: string
    description: string | null
    closesOn: string
    paymentDueOn: string
    status: CampaignStatus
    ordersOpen: boolean
    askPrintName: boolean
    askPrintNumber: boolean
    notesLabel: string | null
  }
  products: FormProductView[]
  children: FormChild[]
  orders: FormOrder[]
  contact: { email: string | null; phone: string | null }
  transfer: TransferInstructions | null
}

export type OrderLinkForm = OrderForm & { club: { name: string }; expiresAt: string }

export type OrderDraft = {
  setSelected: boolean
  choices: Record<string, string>
  printName: string | null
  printNumber: number | null
  contactEmail: string
  contactPhone: string
  notes: string | null
}

/** Where a form writes: the app's order routes, or a personal link's. */
export type OrderEndpoints = {
  place: (participantPersonId: string, draft: OrderDraft) => { url: string; body: Record<string, unknown> }
  update: (orderId: string, draft: OrderDraft) => { url: string; method: 'PUT' | 'POST'; body: Record<string, unknown> }
  cancel: (orderId: string) => string
}

export const appEndpoints: OrderEndpoints = {
  place: (participantPersonId, draft) => ({ url: '/api/payments/orders', body: { participantPersonId, ...draft } }),
  update: (orderId, draft) => ({ url: `/api/payments/orders/${orderId}`, method: 'PUT', body: { ...draft } }),
  cancel: (orderId) => `/api/payments/orders/${orderId}/cancel`,
}

export function linkEndpoints(token: string): OrderEndpoints {
  const base = `/api/payments/order-links/${encodeURIComponent(token)}/orders`
  return {
    place: (participantPersonId, draft) => ({ url: base, body: { participantPersonId, ...draft } }),
    update: (orderId, draft) => ({ url: base, method: 'POST', body: { id: orderId, ...draft } }),
    cancel: (orderId) => `${base}/${orderId}/cancel`,
  }
}

export type WriteOutcome =
  | { ok: true }
  | { ok: false; status: number; message: string | null; code: string | null; fieldErrors: Record<string, string> }

type ErrorBody = { error?: string; code?: string; fieldErrors?: Record<string, string> }

/** Sends one write; a lock token goes in the platform optimistic-lock header. */
export async function sendOrderWrite(
  url: string,
  method: 'POST' | 'PUT',
  body: Record<string, unknown> | null,
  lockToken: string | null,
): Promise<WriteOutcome> {
  const send = () =>
    apiCall<ErrorBody>(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
  const call = lockToken ? await withScopedApiRequestHeaders(buildOptimisticLockHeader(lockToken), send) : await send()
  if (call.ok) return { ok: true }
  return {
    ok: false,
    status: call.status,
    message: call.result?.error ?? null,
    code: call.result?.code ?? null,
    fieldErrors: call.result?.fieldErrors ?? {},
  }
}
