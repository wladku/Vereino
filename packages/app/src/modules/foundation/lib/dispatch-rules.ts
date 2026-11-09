// P-30 dispatch rules (foundation III DD-M03, DD-M04, DD-M06, DD-M09; S12.4 as amended by DD-M17): the delivery rows a
// dispatch writes, the retry schedule, the failure codes and the per-process send rate. Pure; the services apply them.
import { createHash } from 'node:crypto'
import type { AudienceReason, Recipient, RecipientChannel } from '@vereino/core'

export const DELIVERY_STATUSES = ['queued', 'sent', 'failed', 'skipped'] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export const SKIP_REASONS = ['unreachable', 'opted_out', 'delivery_disabled'] as const
export type SkipReason = (typeof SKIP_REASONS)[number]

export const FAILURE_CODES = ['transport_unavailable', 'provider_rejected', 'address_invalid', 'render_failed'] as const
export type FailureCode = (typeof FAILURE_CODES)[number]

/** A delivery is attempted at most this many times; `attempts` is taken with the lease (DD-M03). */
export const MAX_DELIVERY_ATTEMPTS = 5

/** Minutes to wait after the 1st, 2nd, 3rd and 4th failed attempt. */
export const RETRY_BACKOFF_MINUTES: readonly number[] = [1, 5, 15, 60]

/** How long a worker holds a delivery before another may take it (DD-M03). */
export const LEASE_SECONDS = 120

/** E-mails per second per process, below Resend's default 10/s (S12.4). */
export const EMAIL_SENDS_PER_SECOND = 8

/** `notificationService.createBatch` takes at most this many users per call. */
export const IN_APP_BATCH_SIZE = 1000

/**
 * A bare address (foundation III glossary *Recipient*: phase 5 requesters): someone the club writes to without a
 * person record, e.g. a guest who requested a facility booking. E-mail only, in the locale the guest used.
 */
export type BareAddress = { readonly email: string; readonly locale: string }

/**
 * The key of a bare address in a dispatch's `secrets` (P-30 `recipientKey`): the SHA-256 of the trimmed, lower-cased
 * address, so the map never holds the address itself.
 */
export function bareAddressKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

/** One planned delivery row: a recipient on one channel, or one `skipped` row for an unreachable person. */
export type PlannedDelivery = {
  /** Null for a bare address. */
  personId: string | null
  userId: string | null
  channel: RecipientChannel
  email: string | null
  locale: string
  reasons: AudienceReason[]
  status: 'queued' | 'skipped'
  skipReason: 'unreachable' | null
  /** The recipient's secret params (a raw link token), attached to the e-mail row only (DD-M04). */
  secret: Record<string, unknown> | null
}

/**
 * One row per recipient and channel (DD-M06): in-app rows carry the user id, e-mail rows the address and the
 * recipient's secret; a recipient without channels gets one `skipped` / `unreachable` e-mail row, so the status list
 * shows them. Secrets of persons without an e-mail row are dropped.
 */
export function planDeliveries(
  recipients: readonly Recipient[],
  secrets: ReadonlyMap<string, Record<string, unknown>> = new Map(),
): PlannedDelivery[] {
  const rows: PlannedDelivery[] = []
  for (const recipient of recipients) {
    const base = { personId: recipient.personId, locale: recipient.locale, reasons: [...recipient.reasons] }
    if (recipient.channels.length === 0) {
      rows.push({
        ...base,
        userId: null,
        channel: 'email',
        email: null,
        status: 'skipped',
        skipReason: 'unreachable',
        secret: null,
      })
      continue
    }
    for (const channel of recipient.channels) {
      const isEmail = channel === 'email'
      rows.push({
        ...base,
        userId: isEmail ? null : recipient.userId,
        channel,
        email: isEmail ? recipient.email : null,
        status: 'queued',
        skipReason: null,
        secret: isEmail ? (secrets.get(recipient.personId) ?? null) : null,
      })
    }
  }
  return rows
}

/**
 * One e-mail row per bare address, with its secret (looked up by `bareAddressKey`); an empty address is one `skipped` /
 * `unreachable` row. Bare addresses have no reasons and no in-app channel.
 */
export function planAddressDeliveries(
  addresses: readonly BareAddress[],
  secrets: ReadonlyMap<string, Record<string, unknown>> = new Map(),
): PlannedDelivery[] {
  return addresses.map((address) => {
    const email = address.email.trim()
    const base = { personId: null, userId: null, channel: 'email' as const, locale: address.locale, reasons: [] }
    if (!email) return { ...base, email: null, status: 'skipped', skipReason: 'unreachable', secret: null }
    return {
      ...base,
      email,
      status: 'queued',
      skipReason: null,
      secret: secrets.get(bareAddressKey(email)) ?? null,
    }
  })
}

/** The installed classifier's verdict (`communication_channels/lib/error-classification.ts`, DD-M09). */
export type SendErrorClassification = { transient: boolean; status?: number; message: string }

const TRANSPORT_UNAVAILABLE = /EMAIL_TRANSPORT_NOT_CONFIGURED|EMAIL_FROM_NOT_CONFIGURED/
const ADDRESS_INVALID = /invalid[^.]*(address|recipient|e-?mail)|(address|recipient|e-?mail)[^.]*invalid/i

/**
 * The coded reason of a failed send (DD-M09): a transient error and a missing transport are `transport_unavailable`,
 * a rejected address `address_invalid`, any other permanent error `provider_rejected`. The message is only matched,
 * never stored (it may echo the address).
 */
export function failureCodeFor(classification: SendErrorClassification): FailureCode {
  if (classification.transient || TRANSPORT_UNAVAILABLE.test(classification.message)) return 'transport_unavailable'
  if (ADDRESS_INVALID.test(classification.message)) return 'address_invalid'
  return 'provider_rejected'
}

export type AttemptOutcome = { kind: 'retry'; delayMs: number } | { kind: 'fail'; failureCode: FailureCode }

/**
 * What a failed attempt leads to (DD-M03): a transient error is retried with backoff until the 5th attempt, a
 * permanent one fails at once. `attempts` is the count after this attempt (taken with the lease).
 */
export function attemptOutcome(attempts: number, classification: SendErrorClassification): AttemptOutcome {
  const failureCode = failureCodeFor(classification)
  if (!classification.transient || attempts >= MAX_DELIVERY_ATTEMPTS) return { kind: 'fail', failureCode }
  // `attempts` is 1…4 here, so the schedule always has an entry.
  const minutes = RETRY_BACKOFF_MINUTES[Math.max(0, attempts - 1)]
  return { kind: 'retry', delayMs: minutes * 60_000 }
}

/** The order the reasons of a recipient are named in (the first one explains the e-mail in its footer). */
const REASON_PRIORITY: readonly AudienceReason[] = ['guardian', 'participant', 'coach', 'direct']

/** The reason an e-mail's footer names: guardian before participant before coach before direct. */
export function primaryReason(reasons: readonly string[]): AudienceReason {
  return REASON_PRIORITY.find((reason) => reasons.includes(reason)) ?? 'direct'
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

export type SendRateLimiter = { acquire(): Promise<void> }

/**
 * At most `max` acquisitions in any window of `windowMs` (a sliding window, stricter than a token bucket's burst):
 * each caller reserves its slot synchronously, so concurrent senders in one process never overrun it (S12.4).
 */
export function createSendRateLimiter(options: {
  max: number
  windowMs: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}): SendRateLimiter {
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const slots: number[] = []
  return {
    async acquire() {
      const current = now()
      while (slots.length > 0 && current - slots[0] > options.windowMs) slots.shift()
      // The slot is the moment the window frees up: `max` places back plus one millisecond past the window.
      const slot = slots.length < options.max ? current : slots[slots.length - options.max] + options.windowMs + 1
      slots.push(Math.max(slot, current))
      if (slot > current) await sleep(slot - current)
    },
  }
}
