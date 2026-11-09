// Online facility request helpers (#125, facilities spec P-04, P-05, B-25, TEST-035, TEST-036): the guest's sessionless
// calls, the confirmation link out of a captured e-mail, the administrator's queue and decisions, the expiry job
// through the operator CLI, and the database facts a test checks — the stored hash, the encrypted contact columns and
// the wiped delivery secret — without ever filtering an encrypted column in SQL.
import fs from 'node:fs'
import path from 'node:path'
import { expect, type APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { APP_ROOT, OPTIMISTIC_LOCK_HEADER, call, mercato, type Club } from './club'
import { awaitEmails } from './communication'
import { publicCall, type PublicResult } from './declaration-links'
import type { CapturedMessage } from './messaging'

export const VERIFY_API = '/api/facilities/public/requests/verify'

export const requestsApi = (clubSlug: string, placeSlug: string): string =>
  `/api/facilities/public/${encodeURIComponent(clubSlug)}/places/${encodeURIComponent(placeSlug)}/requests`

/** The guest's form for one 90-minute unit at `startsAt` (external renter, rules accepted, English e-mails). */
export function requestForm(startsAt: string, contactEmail: string, overrides: Record<string, unknown> = {}) {
  return {
    startsAt,
    units: 1,
    renterDisplayName: 'Akademia Gości',
    renterCategory: 'external_commercial',
    contactName: 'Gabriela Gość',
    contactPhone: '600 100 200',
    contactEmail,
    purpose: 'Sparing drużyn młodzieżowych',
    regulationsAccepted: true,
    locale: 'en',
    website: '',
    ...overrides,
  }
}

export function submitRequest(
  clubSlug: string,
  placeSlug: string,
  form: Record<string, unknown>,
): Promise<PublicResult> {
  return publicCall('POST', requestsApi(clubSlug, placeSlug), form)
}

export function verifyRequest(token: string): Promise<PublicResult> {
  return publicCall('POST', VERIFY_API, { token })
}

/** The raw token of the `/p/<club>/requests/verify/<token>` link in a captured e-mail. */
export function requestTokenFrom(message: CapturedMessage): string {
  const link = message.links.find((href) => href.includes('/requests/verify/'))
  if (!link) throw new Error(`[internal] no request confirmation link in "${message.subject}"`)
  return decodeURIComponent(new URL(link).pathname.split('/').pop() ?? '')
}

/** Waits for the confirmation e-mail to `address` and returns its token. */
export async function confirmationToken(address: string, count = 1): Promise<string> {
  const messages = await awaitEmails(address, 'Confirm your booking request', count)
  return requestTokenFrom(messages[messages.length - 1])
}

/** Submits and confirms a request; returns the rental id and the token. */
export async function heldRequest(
  clubSlug: string,
  placeSlug: string,
  form: Record<string, unknown>,
): Promise<{ id: string; token: string }> {
  const submitted = await submitRequest(clubSlug, placeSlug, form)
  expect(submitted.status, submitted.text).toBe(202)
  const token = await confirmationToken(String(form.contactEmail))
  const verified = await verifyRequest(token)
  expect(verified.status, verified.text).toBe(200)
  const id = await requestIdByToken(token)
  return { id, token }
}

export type QueueItem = {
  id: string
  updatedAt: string
  placeId: string
  placeName: string
  startsAt: string
  endsAt: string
  units: number
  renterDisplayName: string
  renterCategory: string
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  purpose: string | null
  amount: number | null
  holdExpiresAt: string
  entryBanMatch: boolean
  conflicts: Array<{ kind: string; start: string; end: string }>
}

export type Queue = { items?: QueueItem[]; total?: number; code?: string; error?: string }

export function requestQueue(request: APIRequestContext, token: string) {
  return call<Queue>(request, 'GET', '/api/facilities/rentals/requests?pageSize=100', token)
}

export async function queuedRequest(request: APIRequestContext, token: string, id: string): Promise<QueueItem> {
  const queue = await requestQueue(request, token)
  expect(queue.status, JSON.stringify(queue.body)).toBe(200)
  const item = queue.body?.items?.find((entry) => entry.id === id)
  if (!item) throw new Error(`[internal] request ${id} is not in the queue`)
  return item
}

export type Decision = {
  ok?: boolean
  status?: string
  updatedAt?: string
  code?: string
  error?: string
  fieldErrors?: Record<string, string>
}

/** `POST /api/facilities/rentals/{id}/approve|reject` with the given lock token. */
export function decide(
  request: APIRequestContext,
  token: string,
  id: string,
  action: 'approve' | 'reject',
  data: Record<string, unknown>,
  lockToken: string,
) {
  return call<Decision>(request, 'POST', `/api/facilities/rentals/${id}/${action}`, token, {
    data,
    headers: { [OPTIMISTIC_LOCK_HEADER]: lockToken },
  })
}

export type ExpireResult = { now: string; expired: number; purged: number; expiredIds: string[] }

/** Runs `yarn mercato facilities expire-requests` for the club as of `nowIso` (DD-46). */
export function runExpireRequests(club: Club, nowIso: string): ExpireResult {
  const result = mercato([
    'facilities',
    'expire-requests',
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    '--now',
    nowIso,
  ]) as ExpireResult | null
  if (!result) throw new Error('[internal] facilities expire-requests printed no result')
  return result
}

/** The request row whose stored hash belongs to `token` (looked up through the app's own hash, never the raw token). */
export async function requestIdByToken(token: string): Promise<string> {
  const { hashAuthToken } = await import('@open-mercato/core/modules/auth/lib/tokenHash')
  return withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      'select id from facilities_rentals where verification_token_hash = $1',
      [hashAuthToken(token)],
    )
    if (!rows[0]) throw new Error('[internal] no request row for the token')
    return rows[0].id
  })
}

export type RequestRow = {
  status: string
  verification_token_hash: string | null
  email_verified_at: Date | null
  hold_expires_at: Date | null
  contact_email: string | null
  contact_name: string | null
  renter_display_name: string
  renter_id: string | null
  amount: number
  entry_ban_match: boolean
  decision_reason: string | null
}

/** The stored columns of a request (the encrypted ones as stored, i.e. ciphertext), or null when deleted. */
export async function requestRow(id: string): Promise<RequestRow | null> {
  return withClient(async (client) => {
    const { rows } = await client.query<RequestRow>(
      `select status, verification_token_hash, email_verified_at, hold_expires_at, contact_email, contact_name,
              renter_display_name, renter_id, amount, entry_ban_match, decision_reason
         from facilities_rentals where id = $1`,
      [id],
    )
    return rows[0] ?? null
  })
}

/** Moves a request's confirmation link one minute into the past (the hour a test cannot wait for). */
export async function expireRequestLink(id: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `update facilities_rentals set verification_expires_at = now() - interval '1 minute' where id = $1`,
      [id],
    )
  })
}

/** The deliveries of every dispatch whose source is the request: status, template and whether a secret remains. */
export async function requestDeliveries(id: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ template_id: string; status: string; has_secret: boolean }>(
      `select p.template_id, d.status, d.secret_params is not null as has_secret
         from foundation_deliveries d join foundation_dispatches p on p.id = d.dispatch_id
        where p.source_id = $1 order by p.created_at`,
      [id],
    )
    return rows
  })
}

/** The action-log rows of a request: whether each kept its (encrypted) command payload. */
export async function requestAuditRows(id: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ has_payload: boolean }>(
      `select command_payload is not null as has_payload from action_logs where resource_id = $1 order by created_at`,
      [id],
    )
    return rows
  })
}

/**
 * True when any file of the app's local queue (`QUEUE_STRATEGY=local`, `.mercato/queue` under the app root) — the
 * persisted events and the dispatch jobs — contains `text` (DD-44: the raw token must be in none of them).
 */
export function queueFilesContain(text: string): boolean {
  const root = path.join(APP_ROOT, '.mercato', 'queue')
  if (!fs.existsSync(root)) return false
  const pending = [root]
  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) pending.push(full)
      else if (fs.readFileSync(full, 'utf8').includes(text)) return true
    }
  }
  return false
}
