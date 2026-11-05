// The share text and the public session page of `activities` (foundation III DD-M14, REQ-M08; club spec DD-17): what
// a sessionless reader may see of a session — the activity name, the date, the time, the gathering time (DD-43) and
// the status, nothing else —
// and the paths of the public session page and of its signed-in fallback. Pure; `services/share-text.ts` and
// `services/public-session.ts` apply it.
import type { OccurrenceStatus } from './activities-rules'

/** The public session page (DD-17): `/p/[clubSlug]/s/[occurrenceId]`. */
export function publicSessionPath(clubSlug: string, occurrenceId: string): string {
  return `/p/${encodeURIComponent(clubSlug)}/s/${encodeURIComponent(occurrenceId)}`
}

/** Where a share text points when the club publishes no public page: the member calendar (sign-in). */
export const SIGNED_IN_SESSION_PATH = '/club/calendar'

/** The public session path when the club has a published public page with a slug, else the sign-in fallback. */
export function shareTextPath(
  club: { publicSlug: string | null; publicationEnabled: boolean },
  occurrenceId: string,
): string {
  return club.publicSlug && club.publicationEnabled
    ? publicSessionPath(club.publicSlug, occurrenceId)
    : SIGNED_IN_SESSION_PATH
}

/**
 * The i18n key of the share text line for a session in `status` (a done session reads like a planned one); a session
 * with a gathering time names it (DD-43).
 */
export function shareTextKey(status: OccurrenceStatus, hasGathering = false): string {
  const base = status === 'cancelled' ? 'activities.shareText.cancelled' : 'activities.shareText.planned'
  return hasGathering ? `${base}WithGathering` : base
}

/**
 * A session's date, times and gathering time (null without one) in the club's zone, formatted for `locale`
 * ("wt., 3 lis", "17:00", "18:30", "16:30").
 */
export function sessionWhen(
  session: { startAt: Date; endAt: Date; gatheringAt?: Date | null },
  locale: string,
  timeZone: string,
): { date: string; startTime: string; endTime: string; gatheringTime: string | null } {
  const date = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(
    session.startAt,
  )
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
  return {
    date,
    startTime: time.format(session.startAt),
    endTime: time.format(session.endAt),
    gatheringTime: session.gatheringAt ? time.format(session.gatheringAt) : null,
  }
}

/** What the public session page shows (DD-17, DD-43): no names, no roster, no counts. */
export type PublicSessionView = {
  activityName: string
  occurrenceDate: string
  startAt: string
  endAt: string
  gatheringAt: string | null
  timeZone: string
  status: OccurrenceStatus
}

/** The public view of a session: exactly the fields DD-17 allows. */
export function publicSessionView(
  session: { occurrenceDate: string; startAt: Date; endAt: Date; gatheringAt?: Date | null; status: OccurrenceStatus },
  activityName: string,
  timeZone: string,
): PublicSessionView {
  return {
    activityName,
    occurrenceDate: session.occurrenceDate,
    startAt: session.startAt.toISOString(),
    endAt: session.endAt.toISOString(),
    gatheringAt: session.gatheringAt?.toISOString() ?? null,
    timeZone,
    status: session.status,
  }
}
