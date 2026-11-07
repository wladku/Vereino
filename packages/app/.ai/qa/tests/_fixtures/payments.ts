// Fixtures of the `payments` tests (payments spec phase 4 steps 2, 3, 4 and 8, TEST-018, TEST-048, TEST-020, TEST-019,
// TEST-021, TEST-057, TEST-043; issues #108, #109, #110, #114): fee schedules, discount rules, the period generator,
// the charge list, the charge ledger, the undo probe (#184), the online checkout through the gateway test adapter and
// "Accept cash".
import { spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, type APIRequestContext } from '@playwright/test'
import { APP_ROOT, OPTIMISTIC_LOCK_HEADER, calendarDate, call } from './club'

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

// --- The charge ledger (phase 4 step 3, TEST-020; issue #109) ---

export type ChargePaymentItem = {
  id: string
  amount: number
  method: string
  paidOn: string
  reference: string | null
  receivedBy: { firstName: string; lastName: string } | null
  reversesPaymentId: string | null
  reversed: boolean
  overpayment?: boolean
  gatewayRefundId?: string | null
}

export type ChargeDetail = ChargeItem & {
  payee: string | null
  cancelReason: string | null
  paid: number
  remaining: number
  overdue: boolean
  updatedAt: string
  payments: ChargePaymentItem[]
}

export type LedgerResult = CodedBody & {
  paymentId?: string
  chargeStatus?: string
  remaining?: number
  remainingAmount?: number
  updatedAt?: string
  status?: string
}

export async function getCharge(request: APIRequestContext, token: string, id: string): Promise<ChargeDetail> {
  const result = await call<ChargeDetail>(request, 'GET', `/api/payments/charges/${id}`, token)
  expect(result.status, `GET /api/payments/charges/${id} ${JSON.stringify(result.body)}`).toBe(200)
  return result.body as ChargeDetail
}

function lockHeaders(lock: string | null | undefined): Record<string, string> {
  return lock ? { [OPTIMISTIC_LOCK_HEADER]: lock } : {}
}

export async function recordPayment(
  request: APIRequestContext,
  token: string,
  chargeId: string,
  lock: string | null | undefined,
  data: Record<string, unknown>,
) {
  return call<LedgerResult>(request, 'POST', `/api/payments/charges/${chargeId}/payments`, token, {
    data,
    headers: lockHeaders(lock),
  })
}

export async function cancelCharge(
  request: APIRequestContext,
  token: string,
  chargeId: string,
  lock: string | null | undefined,
  data: Record<string, unknown>,
) {
  return call<LedgerResult>(request, 'POST', `/api/payments/charges/${chargeId}/cancel`, token, {
    data,
    headers: lockHeaders(lock),
  })
}

export async function reversePayment(
  request: APIRequestContext,
  token: string,
  paymentId: string,
  lock: string | null | undefined,
  data: Record<string, unknown>,
) {
  return call<LedgerResult>(request, 'POST', `/api/payments/payments/${paymentId}/reverse`, token, {
    data,
    headers: lockHeaders(lock),
  })
}

// --- The online checkout (phase 4 step 4, TEST-019, TEST-021, TEST-055, TEST-057; issue #110) ---

/**
 * The gateway test adapter's webhook secret and signature header (`payments/services/test-gateway.ts`), registered
 * only under `OM_INTEGRATION_TEST`; repeated here because the tests do not import app modules.
 */
const TEST_GATEWAY_WEBHOOK_SECRET = 'vereino-integration-test-gateway'
const TEST_GATEWAY_SIGNATURE_HEADER = 'x-vereino-test-signature'

export type Quote = CodedBody & { amount?: number; feeAmount?: number; total?: number; feeMode?: string }

export type StartedCheckout = Quote & {
  checkoutId?: string
  providerKey?: string
  clientSession?: { type: string; rendererKey?: string; payload?: { sessionId?: string } } | null
}

export type RefreshedCheckout = CodedBody & {
  id?: string
  status?: string
  state?: string
  amountMismatch?: boolean
  charges?: { id: string; status: string }[]
}

export type MyChargesResult = CodedBody & {
  items?: { id: string; status: string; payable: boolean; payerMissing: boolean; remaining: number }[]
  total?: number
  checkouts?: { id: string; state: string }[]
}

export async function myCharges(request: APIRequestContext, token: string) {
  return call<MyChargesResult>(request, 'GET', '/api/payments/my-charges?pageSize=100', token)
}

export async function quote(request: APIRequestContext, token: string, chargeIds: string[]) {
  return call<Quote>(request, 'POST', '/api/payments/checkout/quote', token, { data: { chargeIds } })
}

export async function startCheckout(request: APIRequestContext, token: string, chargeIds: string[]) {
  return call<StartedCheckout>(request, 'POST', '/api/payments/checkout', token, { data: { chargeIds } })
}

/** Starts a checkout that must succeed; returns its id and the test gateway's session id. */
export async function checkout(request: APIRequestContext, token: string, chargeIds: string[]) {
  const started = await startCheckout(request, token, chargeIds)
  expect(started.status, `POST /api/payments/checkout ${JSON.stringify(started.body)}`).toBe(201)
  const sessionId = started.body?.clientSession?.payload?.sessionId
  expect(sessionId, 'the test gateway session id').toBeTruthy()
  return { checkoutId: String(started.body?.checkoutId), sessionId: String(sessionId), body: started.body }
}

export async function refreshCheckout(request: APIRequestContext, token: string, checkoutId: string) {
  return call<RefreshedCheckout>(request, 'POST', `/api/payments/checkouts/${checkoutId}/refresh`, token)
}

/**
 * Sets the test gateway's provider state with a signed webhook. `notify: false` sends `payment.silent`, which changes
 * only the provider state (no gateway event: the delayed-webhook and late-capture cases). `amountReceived` in złoty.
 */
export async function gatewayWebhook(
  request: APIRequestContext,
  input: { sessionId: string; status: string; amountReceived?: number; eventId?: string; notify?: boolean },
) {
  const raw = JSON.stringify({
    id: input.eventId ?? `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    type: input.notify === false ? 'payment.silent' : 'payment.updated',
    data: { id: input.sessionId, status: input.status, amountReceived: input.amountReceived },
  })
  const signature = createHmac('sha256', TEST_GATEWAY_WEBHOOK_SECRET).update(raw, 'utf-8').digest('hex')
  const response = await request.post('/api/payment_gateways/webhook/vereino_test', {
    data: raw,
    headers: { 'content-type': 'application/json', [TEST_GATEWAY_SIGNATURE_HEADER]: signature },
  })
  expect(response.status(), `webhook ${input.status} ${await response.text()}`).toBe(202)
}

export async function refundPayment(
  request: APIRequestContext,
  token: string,
  paymentId: string,
  lock: string | null | undefined,
  data: Record<string, unknown>,
) {
  return call<LedgerResult & { gatewayRefundId?: string; refunded?: number }>(
    request,
    'POST',
    `/api/payments/payments/${paymentId}/refund`,
    token,
    { data, headers: lockHeaders(lock) },
  )
}

const UNDO_PROBE = path.join(APP_ROOT, '.ai', 'qa', 'tests', '_fixtures', 'payments-undo-probe', 'probe.mjs')

export type UndoProbeResult = {
  error: string | null
  events: Array<{ event: string; payload: Record<string, unknown> }>
}

/**
 * Replays `undoToken` through the command bus in a probe process as `userId` of the club and returns the `payments.*`
 * events it emitted (#184); `failAuditWrite` makes the bus's audit write fail, so the replay rolls back after the undo
 * handler ran. The probe gets its own private queue directory.
 */
export function undoInProbe(
  scope: { tenantId: string; organizationId: string },
  input: { userId: string; undoToken: string; failAuditWrite?: boolean },
): UndoProbeResult {
  const queueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-probe-queue-'))
  try {
    const run = spawnSync(process.execPath, [UNDO_PROBE, JSON.stringify({ ...scope, ...input })], {
      cwd: APP_ROOT,
      env: { ...process.env, QUEUE_BASE_DIR: queueDir },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 300_000,
    })
    const last = run.stdout.trimEnd().split(/\r?\n/).pop() ?? ''
    if (run.status !== 0 || !last.startsWith('{')) {
      throw new Error(
        `[internal] the payments undo probe exited ${String(run.status)}: ${run.stderr}\n${run.stdout.slice(-4000)}`,
      )
    }
    return JSON.parse(last) as UndoProbeResult
  } finally {
    fs.rmSync(queueDir, { recursive: true, force: true })
  }
}

// --- "Accept cash" (#114) ---

export type CashResult = CodedBody & {
  receiptNumber?: string
  amount?: number
  notified?: boolean
  selectedAmount?: number
  payments?: { paymentId: string; chargeId: string; amount: number; chargeStatus: string; remaining: number }[]
}

export async function acceptCash(request: APIRequestContext, token: string, data: Record<string, unknown>) {
  return call<CashResult>(request, 'POST', '/api/payments/cash', token, { data })
}

export type CashPayerItem = {
  payerPersonId: string
  firstName: string
  lastName: string
  wards: { personId: string; firstName: string; lastName: string }[]
  totalDue: number
  chargeCount: number
}

export async function cashPayers(request: APIRequestContext, token: string, query = '') {
  return call<{ items: CashPayerItem[]; total: number }>(request, 'GET', `/api/payments/cash/payers${query}`, token)
}

export type CashChargeItem = { id: string; dueDate: string; remaining: number; overdue: boolean; status: string }

export async function cashCharges(request: APIRequestContext, token: string, payerPersonId: string) {
  return call<{ items: CashChargeItem[]; total: number }>(
    request,
    'GET',
    `/api/payments/cash/charges?payerPersonId=${payerPersonId}`,
    token,
  )
}

export async function cashToday(request: APIRequestContext, token: string) {
  return call<{
    date: string
    items: { receiptNumber: string; payerPersonId: string | null; amount: number; reversed: boolean }[]
    total: number
  }>(request, 'GET', '/api/payments/cash', token)
}
