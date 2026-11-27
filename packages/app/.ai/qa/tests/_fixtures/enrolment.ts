// Fixtures of the section sign-up form (sign-up form spec phases 2 and 3, #799, #800): a published club with a public section that
// accepts applications, the public calls of the form, the e-mailed links, the coordinator's list and decisions, and
// the retention jobs through the CLI.
import { expect, type APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { call, mercato, type Club } from './club'
import { awaitEmails, emailsTo } from './communication'
import { publicCall, type PublicResult } from './declaration-links'
import type { CapturedMessage } from './messaging'
import { createGroup, getGroup, updateGroup } from './groups'
import { publish, putSectionPublic } from './publication'

export const formApi = (clubSlug: string, sectionSlug: string): string =>
  `/api/enrolment/public/${encodeURIComponent(clubSlug)}/sections/${encodeURIComponent(sectionSlug)}/form`

export const submitApi = (clubSlug: string, sectionSlug: string): string =>
  `/api/enrolment/public/${encodeURIComponent(clubSlug)}/sections/${encodeURIComponent(sectionSlug)}/applications`

export const publicApplicationsApi = (clubSlug: string, action: string): string =>
  `/api/enrolment/public/${encodeURIComponent(clubSlug)}/applications/${action}`

/** A child's application: Ola born 2017-03-14, her guardian Anna; English e-mails. */
export function childApplication(email: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'child',
    participantFirstName: 'Ola',
    participantLastName: 'Nowak',
    participantBirthDate: '2017-03-14',
    guardianFirstName: 'Anna',
    guardianLastName: 'Nowak',
    email,
    phone: '600 100 200',
    guardianStatement: true,
    chooseForUs: true,
    wantsTrial: true,
    experience: 'none',
    note: '',
    rulesAccepted: true,
    privacyAcknowledged: true,
    website: '',
    locale: 'en',
    ...overrides,
  }
}

export function submitApplication(clubSlug: string, sectionSlug: string, body: Record<string, unknown>) {
  return publicCall('POST', submitApi(clubSlug, sectionSlug), body)
}

/** The raw token at the end of an `/applications/<page>/<token>` link of a captured e-mail. */
export function tokenFrom(message: CapturedMessage, page: 'confirm' | 'status'): string {
  const link = message.links.find((href) => href.includes(`/applications/${page}/`))
  if (!link) throw new Error(`[internal] no ${page} link in "${message.subject}"`)
  return decodeURIComponent(new URL(link).pathname.split('/').pop() ?? '')
}

export const CONFIRM_SUBJECT = 'Confirm your application'
export const RECEIVED_SUBJECT = 'Application received'
export const NEW_LINK_SUBJECT = 'Your application link'

/** Waits for the `count`-th confirmation e-mail to `address` and returns its token. */
export async function confirmToken(address: string, count = 1): Promise<string> {
  const messages = await awaitEmails(address, CONFIRM_SUBJECT, count)
  return tokenFrom(messages[messages.length - 1], 'confirm')
}

/** Waits for the `count`-th e-mail with a status link to `address` and returns its token. */
export async function statusToken(address: string, subject = RECEIVED_SUBJECT, count = 1): Promise<string> {
  const messages = await awaitEmails(address, subject, count)
  return tokenFrom(messages[messages.length - 1], 'status')
}

export function confirmApplication(clubSlug: string, token: string): Promise<PublicResult> {
  return publicCall('POST', publicApplicationsApi(clubSlug, 'confirm'), { token })
}

export function applicationStatus(clubSlug: string, token: string): Promise<PublicResult> {
  return publicCall('POST', publicApplicationsApi(clubSlug, 'status'), { token })
}

/** Sends and confirms an application; returns the status token and the confirmation answer. */
export async function confirmedApplication(
  clubSlug: string,
  sectionSlug: string,
  body: Record<string, unknown>,
): Promise<{ statusToken: string; confirmed: PublicResult }> {
  const email = String(body.email)
  const before = emailsTo(email, CONFIRM_SUBJECT).length
  const sent = await submitApplication(clubSlug, sectionSlug, body)
  expect(sent.status, sent.text).toBe(202)
  const token = await confirmToken(email, before + 1)
  const received = emailsTo(email, RECEIVED_SUBJECT).length
  const confirmed = await confirmApplication(clubSlug, token)
  expect(confirmed.status, confirmed.text).toBe(200)
  return { statusToken: await statusToken(email, RECEIVED_SUBJECT, received + 1), confirmed }
}

export type ApplicationItem = {
  id: string
  sectionId: string
  groupId: string | null
  groupName: string | null
  chooseForUs: boolean
  state: string
  tab: string | null
  participantName: string
  age: number | null
  waitingNumber: number | null
  flags: string[]
  updatedAt: string
}

export type ApplicationList = {
  items: ApplicationItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function listApplications(request: APIRequestContext, token: string, query: Record<string, string> = {}) {
  const search = new URLSearchParams({ pageSize: '100', ...query })
  return call<ApplicationList>(request, 'GET', `/api/enrolment/applications?${search.toString()}`, token)
}

/** The application of `participant` (first and last name) in a tab, as the caller sees it. */
export async function applicationIn(
  request: APIRequestContext,
  token: string,
  tab: string,
  participantName: string,
): Promise<ApplicationItem | undefined> {
  const list = await listApplications(request, token, { tab })
  expect(list.status, JSON.stringify(list.body)).toBe(200)
  return list.body?.items.find((item) => item.participantName === participantName)
}

export function applicationDetail(request: APIRequestContext, token: string, id: string) {
  return call(request, 'GET', `/api/enrolment/applications/${id}`, token)
}

export function decideApplication(
  request: APIRequestContext,
  token: string,
  id: string,
  action: 'reject' | 'waiting' | 'accept',
  data: Record<string, unknown>,
) {
  return call(request, 'POST', `/api/enrolment/applications/${id}/${action}`, token, { data })
}

export type AcceptAnswer = {
  ok?: boolean
  state?: string
  updatedAt?: string
  membershipId?: string
  participantPersonId?: string
  guardianPersonId?: string | null
  invitation?: 'sent' | 'skipped' | 'failed'
  code?: string
}

/** Accepts an application (phase 3, #800): `POST /api/enrolment/applications/{id}/accept`. */
export function acceptApplication(
  request: APIRequestContext,
  token: string,
  id: string,
  data: Record<string, unknown>,
) {
  return call<AcceptAnswer>(request, 'POST', `/api/enrolment/applications/${id}/accept`, token, { data })
}

/** The stored person and membership ids and state of an application (phase 3). */
export function acceptedRow(
  club: Club,
  id: string,
): Promise<{
  state: string
  note: string | null
  accepted_child_person_id: string | null
  accepted_guardian_person_id: string | null
  accepted_membership_id: string | null
}> {
  return withClient(async (client) => {
    const { rows } = await client.query<{
      state: string
      note: string | null
      accepted_child_person_id: string | null
      accepted_guardian_person_id: string | null
      accepted_membership_id: string | null
    }>(
      `select state, note, accepted_child_person_id, accepted_guardian_person_id, accepted_membership_id
         from enrolment_applications where organization_id = $1 and id = $2`,
      [club.tenant.organizationId, id],
    )
    return rows[0]
  })
}

/** Publishes the club page and switches a section and its groups to applications (the phase 2 fixture switch). */
export async function openApplications(
  request: APIRequestContext,
  club: Club,
  input: { clubSlug: string; sectionId: string; sectionSlug: string; groupIds: readonly string[] },
): Promise<void> {
  const admin = club.adminToken
  await publish(request, admin, input.clubSlug, ['description_schedule', 'conditions', 'contact'])
  const section = await putSectionPublic(request, admin, input.sectionId, {
    isPublic: true,
    publicSlug: input.sectionSlug,
    acceptsApplications: true,
  })
  expect(section.status, JSON.stringify(section.body)).toBe(200)
  for (const groupId of input.groupIds) {
    const current = await getGroup(request, admin, groupId)
    const updated = await updateGroup(
      request,
      admin,
      { id: groupId, isPublic: true, acceptsApplications: true },
      (current.body as { updatedAt?: string } | null)?.updatedAt,
    )
    expect(updated.status, JSON.stringify(updated.body)).toBe(200)
  }
}

export { createGroup }

/** Runs `yarn mercato enrolment <job>` for the club as of `nowIso`. */
export function runEnrolmentJob(
  club: Club,
  job: 'expire-unconfirmed' | 'daily',
  nowIso?: string,
): { now: string; deleted: number; anonymised: number; linksPurged: number; expired?: number; placesFreed?: number } {
  const result = mercato([
    'enrolment',
    job,
    '--tenant',
    club.tenant.tenantId,
    '--org',
    club.tenant.organizationId,
    ...(nowIso ? ['--now', nowIso] : []),
  ]) as {
    now: string
    deleted: number
    anonymised: number
    linksPurged: number
    expired?: number
    placesFreed?: number
  } | null
  if (!result) throw new Error(`[internal] enrolment ${job} printed no result`)
  return result
}

export type ApplicationRow = {
  id: string
  state: string
  participant_first_name: string | null
  guardian_email: string | null
  participant_birth_date: string | null
  applicant_key: string | null
  email_key: string | null
  anonymized_at: Date | null
  created_at: Date
  confirmed_at: Date | null
  closed_at: Date | null
}

/** Every application row of the club, oldest first (the stored columns; names and contacts stay encrypted). */
export function applicationRows(club: Club): Promise<ApplicationRow[]> {
  return withClient(async (client) => {
    const { rows } = await client.query<ApplicationRow>(
      `select id, state, participant_first_name, guardian_email, to_char(participant_birth_date, 'YYYY-MM-DD') as participant_birth_date,
              applicant_key, email_key, anonymized_at, created_at, confirmed_at, closed_at
         from enrolment_applications where organization_id = $1 order by created_at asc, id asc`,
      [club.tenant.organizationId],
    )
    return rows
  })
}

/** Moves the club's unspent confirmation links an hour into the past (the 1-hour link expired). */
export function expireConfirmationLinks(club: Club): Promise<number> {
  return withClient(async (client) => {
    const result = await client.query(
      `update enrolment_confirmation_links set expires_at = now() - interval '1 minute'
        where organization_id = $1 and used_at is null`,
      [club.tenant.organizationId],
    )
    return result.rowCount ?? 0
  })
}

/** Moves an application's confirmation back by `days` (the answer time ran out). */
export function backdateConfirmation(club: Club, id: string, days: number): Promise<void> {
  return withClient(async (client) => {
    await client.query(
      `update enrolment_applications set confirmed_at = confirmed_at - make_interval(days => $3)
        where organization_id = $1 and id = $2`,
      [club.tenant.organizationId, id, days],
    )
  })
}

/** The number of confirmation and status links of an application. */
export function linkCounts(club: Club, id: string): Promise<{ confirmation: number; status: number }> {
  return withClient(async (client) => {
    const confirmation = await client.query<{ count: string }>(
      'select count(*) from enrolment_confirmation_links where organization_id = $1 and application_id = $2',
      [club.tenant.organizationId, id],
    )
    const status = await client.query<{ count: string }>(
      'select count(*) from enrolment_application_links where organization_id = $1 and application_id = $2',
      [club.tenant.organizationId, id],
    )
    return { confirmation: Number(confirmation.rows[0].count), status: Number(status.rows[0].count) }
  })
}

/** The club's in-app notifications of one type (phase 3, #800): the group key and the stored body variables. */
export function notificationRows(club: Club, type: string): Promise<Array<{ group_key: string | null; body: string }>> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ group_key: string | null; body: string }>(
      `select group_key, coalesce(body_variables::text, '') || ' ' || coalesce(body, '') as body
         from notifications where organization_id = $1 and type = $2 order by created_at asc`,
      [club.tenant.organizationId, type],
    )
    return rows
  })
}
