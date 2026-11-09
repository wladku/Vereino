// Personal declaration link helpers (club spec TEST-017, REQ-017; #105): sessionless calls, the link out of a captured
// e-mail, and the two database moves a test cannot wait for — a link past its expiry and a session that has started.
import { request as playwrightRequest, type APIResponse } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import type { CapturedMessage } from './messaging'

export type PublicResult = { status: number; body: Record<string, unknown> | null; text: string }

/** A sessionless call: a fresh request context without cookies or a token; `headers` e.g. the optimistic-lock token. */
export async function publicCall(
  method: 'GET' | 'POST',
  path: string,
  data?: unknown,
  headers?: Record<string, string>,
): Promise<PublicResult> {
  const guest = await playwrightRequest.newContext({ baseURL: process.env.BASE_URL || 'http://localhost:3000' })
  let response: APIResponse
  let text: string
  try {
    response = await guest.fetch(path, { method, headers, ...(data === undefined ? {} : { data }) })
    text = await response.text()
  } finally {
    await guest.dispose()
  }
  let body: Record<string, unknown> | null = null
  try {
    body = JSON.parse(text) as Record<string, unknown>
  } catch {
    body = null
  }
  return { status: response.status(), body, text }
}

/** `POST /api/activities/declaration-links` without a session. */
export function requestLink(email: string, clubSlug: string, occurrenceId: string): Promise<PublicResult> {
  return publicCall('POST', '/api/activities/declaration-links', { email, clubSlug, occurrencePublicRef: occurrenceId })
}

/** The platform's optimistic-lock header: the declaration's `updatedAt` the client read. */
export const lockHeader = (updatedAt: string): Record<string, string> => ({
  'x-om-ext-optimistic-lock-expected-updated-at': updatedAt,
})

export const linkApi = (token: string): string => `/api/activities/declaration-links/${encodeURIComponent(token)}`

/** The raw token of the `/club/d/<token>` link in a captured e-mail. */
export function tokenFromEmail(message: CapturedMessage): string {
  const link = message.links.find((href) => href.includes('/club/d/'))
  if (!link) throw new Error(`[internal] no declaration link in "${message.subject}"`)
  return decodeURIComponent(new URL(link).pathname.split('/').pop() ?? '')
}

/** Moves every link of a person for a session one minute into the past (the expiry a test cannot wait for). */
export async function expireLinks(personId: string, occurrenceId: string): Promise<number> {
  return withClient(async (client) => {
    const result = await client.query(
      `update activities_declaration_tokens set expires_at = now() - interval '1 minute'
        where guardian_person_id = $1 and occurrence_id = $2`,
      [personId, occurrenceId],
    )
    return result.rowCount ?? 0
  })
}

/** Moves a session's start ten minutes into the past and keeps its end ahead (a session in progress). */
export async function startSession(occurrenceId: string): Promise<void> {
  await withClient(async (client) => {
    await client.query(
      `update activities_occurrences set start_at = now() - interval '10 minutes',
          end_at = greatest(end_at, now() + interval '1 hour') where id = $1`,
      [occurrenceId],
    )
  })
}

/**
 * The stored audit rows of a record (`action_logs` is encrypted at rest, so only the plain columns are compared): who
 * acted, whether an undo token and a command payload were kept.
 */
export async function auditRows(resourceId: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ actor_user_id: string | null; has_undo: boolean; has_payload: boolean }>(
      `select actor_user_id, undo_token is not null as has_undo, command_payload is not null as has_payload
         from action_logs where resource_id = $1 order by created_at`,
      [resourceId],
    )
    return rows
  })
}

/** The scheduler's id of the evening reminder job (`moduleWorkerId('activities', 'send-declaration-reminders')`). */
const REMINDERS_JOB = 'activities:send-declaration-reminders'

/** Removes a club's evening reminder schedule: the state of a club set up before the schedule existed (#192). */
export async function dropRemindersSchedule(organizationId: string): Promise<number> {
  return withClient(async (client) => {
    const result = await client.query('delete from scheduled_jobs where organization_id = $1 and name = $2', [
      organizationId,
      REMINDERS_JOB,
    ])
    return result.rowCount ?? 0
  })
}

/** A club's live evening reminder schedules: their cron and time zone. */
export async function remindersSchedules(organizationId: string) {
  return withClient(async (client) => {
    const { rows } = await client.query<{ schedule_value: string; timezone: string; is_enabled: boolean }>(
      `select schedule_value, timezone, is_enabled from scheduled_jobs
        where organization_id = $1 and name = $2 and deleted_at is null`,
      [organizationId, REMINDERS_JOB],
    )
    return rows
  })
}

/** How many links a person holds for a session, how often each was used, and whether a row stores the raw token. */
export async function linkFacts(personId: string, occurrenceId: string, rawToken: string) {
  return withClient(async (client) => {
    const links = await client.query<{ token_hash: string; used_count: number }>(
      'select token_hash, used_count from activities_declaration_tokens where guardian_person_id = $1 and occurrence_id = $2',
      [personId, occurrenceId],
    )
    return {
      count: links.rowCount ?? 0,
      storesRaw: links.rows.some((row) => row.token_hash.includes(rawToken)),
      usedCounts: links.rows.map((row) => row.used_count),
    }
  })
}
