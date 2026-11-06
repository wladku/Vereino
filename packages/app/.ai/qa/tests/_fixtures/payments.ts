// Fixtures of the `payments` tests (payments spec phase 4 step 2, TEST-018, TEST-048; issue #108): fee schedules,
// discount rules, the period generator and the charge list.
import { expect, type APIRequestContext } from '@playwright/test'
import { calendarDate, call } from './club'

export type CodedBody = { error?: string; code?: string }

export type GenerationResult = CodedBody & {
  generationId?: string
  period?: string
  created?: number
  skipped?: number
  payerMissing?: number
}

export type ChargeItem = {
  id: string
  sourceId: string | null
  personId: string | null
  person?: { firstName: string; lastName: string } | null
  payerPersonId: string | null
  payerMissing: boolean
  periodLabel: string | null
  description: string | null
  amount: number
  discountAmount: number
  amountDue: number
  discountRuleId: string | null
  discountRuleName?: string | null
  dueDate: string | null
  status: string | null
  generationId: string | null
}

/** The billing period `offset` months after the club's current month. */
export function periodFromNow(offset: number): string {
  const today = calendarDate()
  const index = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1 + offset
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, '0')}`
}

export async function postFee(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CodedBody & { id?: string }>(request, 'POST', '/api/payments/fees', token, { data })
}

export async function createFee(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const result = await postFee(request, token, data)
  expect(result.status, `POST /api/payments/fees ${JSON.stringify(result.body)}`).toBe(201)
  return String(result.body?.id)
}

export async function postDiscountRule(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CodedBody & { id?: string }>(request, 'POST', '/api/payments/discount-rules', token, { data })
}

export async function createDiscountRule(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  const result = await postDiscountRule(request, token, data)
  expect(result.status, `POST /api/payments/discount-rules ${JSON.stringify(result.body)}`).toBe(201)
  return String(result.body?.id)
}

export async function generate(request: APIRequestContext, token: string, period: string) {
  return call<GenerationResult>(request, 'POST', '/api/payments/charges/generate', token, { data: { period } })
}

export async function listCharges(request: APIRequestContext, token: string, query: string): Promise<ChargeItem[]> {
  const result = await call<{ items?: ChargeItem[] }>(
    request,
    'GET',
    `/api/payments/charges?pageSize=100${query}`,
    token,
  )
  expect(result.status, `GET /api/payments/charges ${JSON.stringify(result.body)}`).toBe(200)
  return result.body?.items ?? []
}

/** The one charge of `personId` for `feeId` among `charges`. */
export function chargeOf(charges: readonly ChargeItem[], personId: string, feeId: string): ChargeItem {
  const found = charges.filter((charge) => charge.personId === personId && charge.sourceId === feeId)
  expect(found, `one charge of ${personId} for ${feeId}`).toHaveLength(1)
  return found[0]
}
