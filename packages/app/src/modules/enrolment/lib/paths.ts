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
