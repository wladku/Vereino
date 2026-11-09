// Client pieces of "My groups' payments" (payments spec REQ-033; UX concept M-18; issue #117): the response shape of
// `GET /api/payments/group-charges`, its query key and the coach's writes (cash, reminders, kit handover). Authorization
// stays on the routes and the commands.
import { useQuery } from '@tanstack/react-query'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'

export const COACH_PAYMENTS_HREF = '/club/coach/payments'

/** Every M-18 query starts with this key, so one invalidation refreshes the groups, the children and the cash. */
export const COACH_PAYMENTS_QUERY_KEY = 'payments-coach'

type PersonName = { firstName: string; lastName: string }

export type GroupTotals = { totalDue: number; peopleToPay: number; peopleOverdue: number }

export type CoachCharge = {
  id: string
  kind: 'fee' | 'order'
  description: string
  periodLabel: string | null
  amountDue: number
  paid: number
  remaining: number
  dueDate: string
  status: string
  overdue: boolean
  collectible: boolean
  payerPersonId: string | null
  payer: PersonName | null
  order: {
    id: string
    campaignId: string
    campaignName: string
    campaignStatus: string
    lines: string[]
    handedOverAt: string | null
    canHandOver: boolean
  } | null
}

export type CoachChild = PersonName & {
  personId: string
  due: number
  overdue: boolean
  payerMissing: boolean
  charges: CoachCharge[]
}

export type CoachCampaign = {
  id: string
  name: string
  status: string
  closesOn: string
  missing: number
  shareText: string
  link: string
}

export type CoachReceipt = {
  receiptNumber: string
  payer: PersonName | null
  amount: number
  chargeCount: number
  createdAt: string
}

export type GroupChargesView = {
  today: string
  coachFeeAccess: 'collect' | 'view' | 'none'
  groups: ({ id: string; name: string; sectionId: string } & GroupTotals)[]
  groupId: string | null
  group: GroupTotals | null
  children: CoachChild[]
  campaigns: CoachCampaign[]
  cash: { items: CoachReceipt[]; total: number; paymentCount: number }
}

class GroupChargesLoadError extends Error {}

export function useGroupCharges(groupId: string | null, due: boolean) {
  return useQuery({
    queryKey: [COACH_PAYMENTS_QUERY_KEY, groupId, due],
    queryFn: async () => {
      const params = new URLSearchParams({ due: due ? '1' : '0' })
      if (groupId) params.set('groupId', groupId)
      const call = await apiCallOrThrow<GroupChargesView>(`/api/payments/group-charges?${params.toString()}`)
      if (!call.result) throw new GroupChargesLoadError()
      return call.result
    },
  })
}

async function post<T>(url: string, body: Record<string, unknown>, errorMessage: string): Promise<T> {
  const call = await apiCallOrThrow<T>(
    url,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    { errorMessage },
  )
  if (!call.result) throw new Error(errorMessage)
  return call.result
}

export type GroupCashInput = {
  groupId: string
  participantPersonId: string
  chargeIds: string[]
  amount: number
  paidOn: string
  notify: boolean
}

export function collectCash(input: GroupCashInput, errorMessage: string) {
  return post<{ receiptNumber: string; amount: number; notified: number }>(
    '/api/payments/group-charges/cash',
    input,
    errorMessage,
  )
}

export function remindPayers(input: { groupId: string; participantPersonId: string }, errorMessage: string) {
  return post<{ charges: number; recipients: number }>('/api/payments/group-charges/remind', input, errorMessage)
}

export function remindCampaign(campaignId: string, groupId: string, errorMessage: string) {
  return post<{ children: number; recipients: number }>(
    `/api/payments/group-charges/campaigns/${encodeURIComponent(campaignId)}/remind`,
    { groupId },
    errorMessage,
  )
}

export function handOverKit(orderId: string, input: { groupId: string; confirmUnpaid: boolean }, errorMessage: string) {
  return post<{ handedOverAt: string; unpaid: boolean }>(
    `/api/payments/orders/${encodeURIComponent(orderId)}/hand-over`,
    input,
    errorMessage,
  )
}
