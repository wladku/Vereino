// The gateway test adapter of the payments integration tests (club spec *Integration Coverage*: "the Stripe gateway is
// replaced by a test adapter conforming to the `payment_gateways` contract", pattern `integrations.mock-adapters`;
// the owner's default of 2026-11-06 on #110). `payments/di.ts` registers it only when `OM_INTEGRATION_TEST=true` (the
// ephemeral integration runner), so a deployment never offers it. No credentials: a test signs its webhooks with the
// fixed secret below.
//
// A session starts `pending`, like a Stripe PaymentIntent waiting for the Payment Element. A test then sets the
// provider state with a signed webhook to `/api/payment_gateways/webhook/vereino_test`:
// - `payment.updated` changes the state and is mapped to the unified status, so the gateway emits its event;
// - `payment.silent` changes only the provider state and maps to `unknown`, so no event follows — the "webhook
//   delayed" and late-capture cases, which the fulfilment then finds through `getPaymentStatus` (DD-42).
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type {
  CancelResult,
  CaptureResult,
  CreateSessionResult,
  GatewayAdapter,
  GatewayPaymentStatus,
  RefundResult,
  UnifiedPaymentStatus,
  VerifyWebhookInput,
  WebhookEvent,
} from '@open-mercato/shared/modules/payment_gateways/types'

export const TEST_GATEWAY_PROVIDER = 'vereino_test'
export const TEST_GATEWAY_RENDERER = 'vereino_test.form'
export const TEST_GATEWAY_SIGNATURE_HEADER = 'x-vereino-test-signature'
/** Only ever accepted by the adapter registered under `OM_INTEGRATION_TEST`; never a production secret. */
export const TEST_GATEWAY_WEBHOOK_SECRET = 'vereino-integration-test-gateway'

/** The event type that changes the provider state without a unified status change (no gateway event). */
export const TEST_GATEWAY_SILENT_EVENT = 'payment.silent'

type TestSession = {
  status: UnifiedPaymentStatus
  amount: number
  amountReceived: number
  refunded: number
  currencyCode: string
}

const STORE_KEY = '__vereinoTestGatewaySessions__'

/** Kept on `globalThis`, like the platform's adapter registry, so every route bundle of the server sees one store. */
function sessions(): Map<string, TestSession> {
  const state = globalThis as typeof globalThis & { [STORE_KEY]?: Map<string, TestSession> }
  state[STORE_KEY] ??= new Map<string, TestSession>()
  return state[STORE_KEY]
}

function sessionOf(sessionId: string): TestSession {
  const session = sessions().get(sessionId)
  if (!session) throw new Error('[internal] Test gateway session not found: ' + sessionId)
  return session
}

export function testGatewaySignature(rawBody: string): string {
  return createHmac('sha256', TEST_GATEWAY_WEBHOOK_SECRET).update(rawBody, 'utf-8').digest('hex')
}

const UNIFIED: readonly UnifiedPaymentStatus[] = [
  'pending',
  'authorized',
  'captured',
  'partially_captured',
  'refunded',
  'partially_refunded',
  'cancelled',
  'failed',
  'expired',
]

function asUnified(value: unknown): UnifiedPaymentStatus {
  return UNIFIED.includes(value as UnifiedPaymentStatus) ? (value as UnifiedPaymentStatus) : 'unknown'
}

export const testGatewayAdapter: GatewayAdapter = {
  providerKey: TEST_GATEWAY_PROVIDER,

  createSession(input): Promise<CreateSessionResult> {
    const sessionId = `vtest_${randomUUID()}`
    sessions().set(sessionId, {
      status: 'pending',
      amount: input.amount,
      amountReceived: 0,
      refunded: 0,
      currencyCode: input.currencyCode,
    })
    return Promise.resolve({
      sessionId,
      status: 'pending',
      clientSession: {
        type: 'embedded',
        rendererKey: TEST_GATEWAY_RENDERER,
        payload: { sessionId, amount: input.amount, currencyCode: input.currencyCode },
      },
    })
  },

  capture(input): Promise<CaptureResult> {
    const session = sessionOf(input.sessionId)
    session.status = 'captured'
    session.amountReceived = input.amount ?? session.amount
    return Promise.resolve({ status: 'captured', capturedAmount: session.amountReceived })
  },

  refund(input): Promise<RefundResult> {
    const session = sessionOf(input.sessionId)
    const amount = input.amount ?? session.amountReceived - session.refunded
    session.refunded += amount
    session.status = session.refunded >= session.amountReceived ? 'refunded' : 'partially_refunded'
    return Promise.resolve({ refundId: `vtest_re_${randomUUID()}`, status: session.status, refundedAmount: amount })
  },

  cancel(input): Promise<CancelResult> {
    const session = sessionOf(input.sessionId)
    if (session.status === 'pending' || session.status === 'authorized') session.status = 'cancelled'
    return Promise.resolve({ status: session.status })
  },

  getStatus(input): Promise<GatewayPaymentStatus> {
    const session = sessionOf(input.sessionId)
    return Promise.resolve({
      status: session.status,
      amount: session.amount,
      amountReceived: session.amountReceived,
      currencyCode: session.currencyCode,
    })
  },

  verifyWebhook(input: VerifyWebhookInput): Promise<WebhookEvent> {
    const rawBody = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf-8')
    const header = input.headers[TEST_GATEWAY_SIGNATURE_HEADER]
    const provided = Buffer.from(Array.isArray(header) ? (header[0] ?? '') : (header ?? ''), 'utf-8')
    const expected = Buffer.from(testGatewaySignature(rawBody), 'utf-8')
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new Error('[internal] Invalid test gateway signature')
    }
    const body = JSON.parse(rawBody) as {
      id?: string
      type?: string
      data?: { id?: string; status?: string; amountReceived?: number }
    }
    const data = body.data ?? {}
    const session = data.id ? sessions().get(data.id) : undefined
    if (session && data.status) {
      session.status = asUnified(data.status)
      if (session.status === 'captured') session.amountReceived = data.amountReceived ?? session.amount
    }
    const eventId = body.id ?? randomUUID()
    return Promise.resolve({
      eventType: body.type ?? 'payment.updated',
      eventId,
      data,
      idempotencyKey: eventId,
      timestamp: new Date(),
    })
  },

  mapStatus(providerStatus: string, eventType?: string): UnifiedPaymentStatus {
    return eventType === TEST_GATEWAY_SILENT_EVENT ? 'unknown' : asUnified(providerStatus)
  },
}

/** The webhook's session hint: the payload's `data.id`. */
export function readTestGatewaySessionId(payload: Record<string, unknown> | null): string | null {
  const data = payload?.data as { id?: unknown } | undefined
  return typeof data?.id === 'string' ? data.id : null
}
