// Client pieces of the public application pages of `enrolment` (sign-up form spec P-J1…P-J4; #799): the form read
// shared by the "Apply" button and the form page (one react-query key, so the button's read is the page's cache), and
// the sessionless calls of the form, the confirmation page and the status page. Every call answers an outcome instead
// of throwing for an answer of the API; only a network failure throws. The response shapes are the server's own types.
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { TranslateFn } from '@open-mercato/shared/lib/i18n/context'
import type { PublicFormGroup, PublicFormView, StatusView } from '../../services/views'
import { publicApplicationsApi, publicSectionApi } from '../../lib/paths'
import type { ApplicationKind } from '../../lib/states'

export type { PublicFormGroup, PublicFormView }

/** The club header of the public pages (logo, name, navigation, links, accent). */
export type PublicEnrolmentClub = PublicFormView['club']

/** A guest has no session: a 401 or 403 is an answer to show, never a reason to redirect to the staff sign-in. */
const GUEST_HEADERS = {
  'content-type': 'application/json',
  'x-om-unauthorized-redirect': '0',
  'x-om-forbidden-redirect': '0',
}

type CodedBody = { code?: unknown; fieldErrors?: unknown; club?: unknown }

const codeOf = (body: CodedBody | null): string | null => (typeof body?.code === 'string' ? body.code : null)

function clubOf(body: CodedBody | null): PublicEnrolmentClub | null {
  const club = body?.club
  return club && typeof club === 'object' ? (club as PublicEnrolmentClub) : null
}

/** The seconds of a `Retry-After` header, or null when it does not name any. */
function retryAfterOf(response: Response): number | null {
  const value = Number(response.headers.get('Retry-After') ?? '')
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null
}

function post(url: string, body: unknown) {
  return apiCall<CodedBody & Record<string, unknown>>(url, {
    method: 'POST',
    headers: GUEST_HEADERS,
    body: JSON.stringify(body),
  })
}

export const clubHref = (clubSlug: string): string => `/p/${encodeURIComponent(clubSlug)}`

export const sectionHref = (clubSlug: string, sectionSlug: string): string =>
  `${clubHref(clubSlug)}/sections/${encodeURIComponent(sectionSlug)}`

// --- The form (P-J1, P-J2) ---

export type PublicFormLoad =
  { status: 'ok'; form: PublicFormView } | { status: 'closed'; club: PublicEnrolmentClub | null }

/** The key the "Apply" button and the form page share. */
export const publicFormQueryKey = (clubSlug: string, sectionSlug: string) =>
  ['enrolment-public-form', clubSlug, sectionSlug] as const

async function loadPublicForm(clubSlug: string, sectionSlug: string): Promise<PublicFormLoad> {
  const call = await apiCall<PublicFormView & CodedBody>(`${publicSectionApi(clubSlug, sectionSlug)}/form`, {
    headers: GUEST_HEADERS,
  })
  if (call.ok && call.result) return { status: 'ok', form: call.result }
  if (call.status === 404) return { status: 'closed', club: clubOf(call.result) }
  throw new Error(`[internal] the application form could not be read (${String(call.status)})`)
}

export function usePublicForm(clubSlug: string, sectionSlug: string) {
  return useQuery({
    queryKey: publicFormQueryKey(clubSlug, sectionSlug),
    queryFn: () => loadPublicForm(clubSlug, sectionSlug),
    retry: false,
    staleTime: 60_000,
  })
}

/** The body of `POST …/sections/{sectionSlug}/applications` (`applicationSubmitSchema`). */
export type ApplicationBody = {
  kind: ApplicationKind
  participantFirstName: string
  participantLastName: string
  participantBirthDate: string
  guardianFirstName: string | null
  guardianLastName: string | null
  email: string
  phone: string
  guardianStatement?: boolean
  groupId: string | null
  chooseForUs: boolean
  wantsTrial: boolean
  experience: string | null
  note: string | null
  rulesAccepted: boolean
  privacyAcknowledged: boolean
  website: string
  locale: string
}

export type SubmitOutcome =
  | { status: 'sent' }
  | { status: 'closed' }
  /** `fields`: the fields the API refused, by field name; `code`: the business code of a refusal. */
  | { status: 'invalid'; code: string | null; fields: string[] }
  | { status: 'too_many'; retryAfter: number | null }
  | { status: 'failed' }

function fieldsOf(body: CodedBody | null): string[] {
  const fields = body?.fieldErrors
  return fields && typeof fields === 'object' ? Object.keys(fields) : []
}

/** Sends the application without a session. Throws only when the network fails. */
export async function submitApplication(
  clubSlug: string,
  sectionSlug: string,
  body: ApplicationBody,
): Promise<SubmitOutcome> {
  const call = await post(`${publicSectionApi(clubSlug, sectionSlug)}/applications`, body)
  if (call.ok) return { status: 'sent' }
  if (call.status === 404) return { status: 'closed' }
  if (call.status === 422 || call.status === 400) {
    return { status: 'invalid', code: codeOf(call.result), fields: fieldsOf(call.result) }
  }
  if (call.status === 429) return { status: 'too_many', retryAfter: retryAfterOf(call.response) }
  return { status: 'failed' }
}

export type UniformOutcome =
  { status: 'sent' } | { status: 'too_many'; retryAfter: number | null } | { status: 'failed' }

async function uniform(url: string, email: string): Promise<UniformOutcome> {
  const call = await post(url, { email: email.trim() })
  if (call.ok) return { status: 'sent' }
  if (call.status === 429) return { status: 'too_many', retryAfter: retryAfterOf(call.response) }
  return { status: 'failed' }
}

/** "Send again" after the form (DD-J06): a uniform 202 whether or not the address is known. */
export function resendConfirmation(clubSlug: string, email: string): Promise<UniformOutcome> {
  return uniform(`${publicApplicationsApi(clubSlug)}/resend-confirmation`, email)
}

/** "Send me a new link" on an expired status link (DD-J07): a uniform 202. */
export function requestNewLink(clubSlug: string, email: string): Promise<UniformOutcome> {
  return uniform(`${publicApplicationsApi(clubSlug)}/resend-link`, email)
}

// --- The confirmation (P-J3) ---

export type ConfirmOutcome =
  | { status: 'confirmed'; state: 'new' | 'waiting'; waitingNumber: number | null; answerDays: number }
  | { status: 'used' }
  | { status: 'expired' }
  | { status: 'too_many'; retryAfter: number | null }
  | { status: 'failed' }

/** Spends the e-mailed token, sent in the body (never in a URL the server logs). */
export async function confirmApplication(clubSlug: string, token: string): Promise<ConfirmOutcome> {
  const call = await post(`${publicApplicationsApi(clubSlug)}/confirm`, { token })
  const result = call.result
  if (call.ok && result && (result.state === 'new' || result.state === 'waiting')) {
    return {
      status: 'confirmed',
      state: result.state,
      waitingNumber: typeof result.waitingNumber === 'number' ? result.waitingNumber : null,
      answerDays: typeof result.answerDays === 'number' ? result.answerDays : 0,
    }
  }
  if (call.status === 410 && codeOf(result) === 'token_link_used') return { status: 'used' }
  if (call.status === 410 || call.status === 400 || call.status === 404) return { status: 'expired' }
  if (call.status === 429) return { status: 'too_many', retryAfter: retryAfterOf(call.response) }
  return { status: 'failed' }
}

/** The club's header for a page that knows only the slug (the public club page's read). */
export function usePublicClub(clubSlug: string, enabled = true) {
  return useQuery({
    queryKey: ['enrolment-public-club', clubSlug],
    queryFn: async (): Promise<PublicEnrolmentClub | null> => {
      const call = await apiCall<CodedBody>(`/api/club_core/public/${encodeURIComponent(clubSlug)}`, {
        headers: GUEST_HEADERS,
      })
      return clubOf(call.result)
    },
    retry: false,
    staleTime: 300_000,
    enabled,
  })
}

// --- The status page (P-J4) ---

export type ApplicationStatus = StatusView

export type StatusLoad =
  { status: 'ok'; view: ApplicationStatus } | { status: 'expired'; club: PublicEnrolmentClub | null }

export const statusQueryKey = (clubSlug: string, token: string) => ['enrolment-public-status', clubSlug, token] as const

/** Reads the application behind a status link (read only, spends nothing). */
export async function loadStatus(clubSlug: string, token: string): Promise<StatusLoad> {
  if (!token) return { status: 'expired', club: null }
  const call = await post(`${publicApplicationsApi(clubSlug)}/status`, { token })
  if (call.ok && call.result) return { status: 'ok', view: call.result as unknown as ApplicationStatus }
  if (call.status === 410 || call.status === 400 || call.status === 404) {
    return { status: 'expired', club: clubOf(call.result) }
  }
  throw new Error(`[internal] the application status could not be read (${String(call.status)})`)
}

export type WithdrawOutcome =
  | { status: 'withdrawn' }
  | { status: 'conflict' }
  | { status: 'expired' }
  | { status: 'too_many'; retryAfter: number | null }
  | { status: 'failed' }

export async function withdrawApplication(clubSlug: string, token: string): Promise<WithdrawOutcome> {
  const call = await post(`${publicApplicationsApi(clubSlug)}/withdraw`, { token })
  if (call.ok) return { status: 'withdrawn' }
  if (call.status === 409) return { status: 'conflict' }
  if (call.status === 410 || call.status === 400 || call.status === 404) return { status: 'expired' }
  if (call.status === 429) return { status: 'too_many', retryAfter: retryAfterOf(call.response) }
  return { status: 'failed' }
}

// --- Formatting ---

/** "1 September 2026" for a calendar date `YYYY-MM-DD`, in the reader's locale. */
export function formatCalendarDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date.slice(0, 10)}T00:00:00Z`),
  )
}

/** "18 November 2026" for an instant, in the reader's locale and zone. */
export function formatInstantDate(instant: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(instant))
}

/** The age rule of a group as the form shows it: birth years for a "U" team, ages otherwise; null without one. */
export function groupRangeLabel(group: PublicFormGroup, t: TranslateFn): string | null {
  const rule = group.fitRule
  if (!rule) return null
  if (rule.kind === 'birth_years') {
    if (rule.from === null) return t('enrolment.public.group.bornUntil', { to: rule.to })
    if (rule.from === rule.to) return t('enrolment.public.group.bornIn', { year: rule.to })
    return t('enrolment.public.group.born', { from: rule.from, to: rule.to })
  }
  if (rule.ageFrom !== null && rule.ageTo !== null) {
    return t('enrolment.public.group.ages', { from: rule.ageFrom, to: rule.ageTo })
  }
  if (rule.ageFrom !== null) return t('enrolment.public.group.agesFrom', { from: rule.ageFrom })
  return t('enrolment.public.group.agesTo', { to: rule.ageTo ?? 0 })
}
