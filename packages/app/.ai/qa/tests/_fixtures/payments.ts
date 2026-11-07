// Fixtures of the `payments` tests (payments spec phase 4 steps 2 and 3, TEST-018, TEST-048, TEST-020; issues #108,
// #109): fee schedules, discount rules, the period generator, the charge list, the charge ledger and the undo probe
// (#184).
import { spawnSync } from 'node:child_process'
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
