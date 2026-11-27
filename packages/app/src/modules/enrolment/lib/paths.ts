// The public and member paths of `enrolment` (sign-up form spec P-J1…P-J4, M-J2, M-J3; #799). Client-safe.

const segment = (value: string): string => encodeURIComponent(value)

/** P-J2: the form of a section. */
export function applyPath(clubSlug: string, sectionSlug: string): string {
  return `/p/${segment(clubSlug)}/sections/${segment(sectionSlug)}/apply`
}

/** P-J3: the confirmation page (the token is posted in the body of the API call, never spent by the GET). */
export function applicationConfirmPath(clubSlug: string, token: string): string {
  return `/p/${segment(clubSlug)}/applications/confirm/${segment(token)}`
}

/** P-J4: the status page. */
export function applicationStatusPath(clubSlug: string, token: string): string {
  return `/p/${segment(clubSlug)}/applications/status/${segment(token)}`
}

/** The public API of a club's applications. */
export function publicApplicationsApi(clubSlug: string): string {
  return `/api/enrolment/public/${segment(clubSlug)}/applications`
}

/** The public API of a section's form. */
export function publicSectionApi(clubSlug: string, sectionSlug: string): string {
  return `/api/enrolment/public/${segment(clubSlug)}/sections/${segment(sectionSlug)}`
}

/** M-J2 and M-J3. */
export const CLUB_APPLICATIONS_HREF = '/club/applications'

export function clubApplicationHref(id: string): string {
  return `${CLUB_APPLICATIONS_HREF}/${segment(id)}`
}

/** B-J1. */
export const BACKEND_APPLICATIONS_HREF = '/backend/enrolment/applications'

export function backendApplicationHref(id: string): string {
  return `${BACKEND_APPLICATIONS_HREF}/${segment(id)}`
}

/**
 * The group sign-up QR code (#869): the query parameter of P-J2 that chooses a group, and the form's address with it.
 * The address carries only the public slugs and the group's id — no token, nothing personal.
 */
export const GROUP_QUERY_PARAM = 'group'

export function groupApplyPath(clubSlug: string, sectionSlug: string, groupId: string): string {
  return `${applyPath(clubSlug, sectionSlug)}?${GROUP_QUERY_PARAM}=${segment(groupId)}`
}

/** The member API that answers a group's sign-up code. */
export function groupSignUpCodeApi(groupId: string): string {
  return `/api/enrolment/groups/${segment(groupId)}/sign-up-code`
}

/** What P-J2 makes of its `group` parameter against the offered groups. */
export type LinkedGroup = { status: 'none' } | { status: 'chosen'; groupId: string } | { status: 'closed' }

/**
 * The group a link chose (#869): none without the parameter; `chosen` when the form offers that group, so the form
 * starts with it selected; `closed` otherwise — the group is not public, not active or takes no applications, and the
 * scanner sees that sign-ups are closed instead of a form for other groups.
 */
export function linkedGroup(
  param: string | readonly string[] | undefined,
  offeredGroupIds: readonly string[],
): LinkedGroup {
  const value = (typeof param === 'string' ? param : param?.[0])?.trim() ?? ''
  if (value === '') return { status: 'none' }
  return offeredGroupIds.includes(value) ? { status: 'chosen', groupId: value } : { status: 'closed' }
}
