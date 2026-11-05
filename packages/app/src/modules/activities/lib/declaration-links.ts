// Personal declaration links (club spec REQ-017, AC-017, *Events, Jobs* row `activities:send-declaration-reminders`;
// foundation P-10, P-19; UX concept M-13, M-14, F-06): who a link request reaches, how long a link lives, whom a link
// lets the holder declare for, and who gets an evening reminder. Pure; `services/declaration-links.ts` applies them.

/** A link lives until the end of its session, and never longer than this (31 days). */
export const DECLARATION_LINK_TTL_MS = 31 * 24 * 60 * 60 * 1000

/** At most this many links per person and session in one hour: a request cannot flood somebody's mailbox. */
export const MAX_LINKS_PER_HOUR = 3

/** The reminder job runs daily at 18:00 in the club's time zone for the sessions of the next day. */
export const DECLARATION_REMINDERS_CRON = '0 18 * * *'

/** An address compared the way people type it: surrounding blanks and letter case do not matter. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/** The persons whose address is `email` (a guardian and their adult ward may share one). */
export function personIdsWithEmail(
  contacts: ReadonlyArray<{ readonly personId: string; readonly email: string | null }>,
  email: string,
): string[] {
  const wanted = normalizeEmail(email)
  if (wanted.length === 0) return []
  return contacts
    .filter((contact) => contact.email !== null && normalizeEmail(contact.email) === wanted)
    .map((c) => c.personId)
}

/**
 * The expiry of a new link: the end of the session, or `now` plus the time to live when the session ends later; null
 * when the session has already ended (no link is issued).
 */
export function linkExpiry(now: Date, sessionEndAt: Date, ttlMs: number = DECLARATION_LINK_TTL_MS): Date | null {
  if (sessionEndAt.getTime() <= now.getTime()) return null
  return new Date(Math.min(sessionEndAt.getTime(), now.getTime() + ttlMs))
}

/**
 * Whom the holder of a link may declare for in one session: themself when they are a participant, then their active
 * wards among the participants, in roster order and without repeats.
 */
export function linkPersonIds(
  ownerId: string,
  participantIds: readonly string[],
  guardiansByWard: ReadonlyMap<string, readonly string[]>,
): string[] {
  return participantIds.filter(
    (personId, index) =>
      participantIds.indexOf(personId) === index &&
      (personId === ownerId || (guardiansByWard.get(personId) ?? []).includes(ownerId)),
  )
}

/**
 * The persons a link request for one session reaches: each matched person who may declare for somebody in it (a
 * participant, or an active guardian of one). Unknown addresses and people outside the session reach nobody.
 */
export function linkRequestOwners(
  matchedPersonIds: readonly string[],
  participantIds: readonly string[],
  guardiansByWard: ReadonlyMap<string, readonly string[]>,
): string[] {
  return [...new Set(matchedPersonIds)].filter(
    (ownerId) => linkPersonIds(ownerId, participantIds, guardiansByWard).length > 0,
  )
}

/**
 * Who gets the evening reminder of one session: for every participant without a declaration (no row or `unknown`),
 * their active guardians, or the participant themself when they have none — each person once, in roster order.
 */
export function reminderOwners(
  participantIds: readonly string[],
  declaredIds: ReadonlySet<string>,
  guardiansByWard: ReadonlyMap<string, readonly string[]>,
): string[] {
  const owners: string[] = []
  for (const personId of participantIds) {
    if (declaredIds.has(personId)) continue
    const guardians = guardiansByWard.get(personId) ?? []
    for (const ownerId of guardians.length > 0 ? guardians : [personId]) {
      if (!owners.includes(ownerId)) owners.push(ownerId)
    }
  }
  return owners
}

/** The page a link opens (M-14); the raw token is the path's last segment. */
export function declarationLinkPath(rawToken: string): string {
  return `/club/d/${encodeURIComponent(rawToken)}`
}

/** The link request page of one session (M-13), reached from the public session page and from an expired link. */
export function linkRequestPath(clubSlug: string, occurrenceId: string): string {
  const query = new URLSearchParams({ club: clubSlug, session: occurrenceId })
  return `/club/link?${query.toString()}`
}

/** The idempotency key of one reminder: one per person and session, so a rerun of the job sends nothing twice. */
export function reminderKey(occurrenceId: string, personId: string): string {
  return `activities:declaration-reminder:${occurrenceId}:${personId}`
}

/** A session's date ("Tuesday, 3 November") and time range ("17:00–18:30") in `timeZone`, for the e-mail's `locale`. */
export function sessionWhenLabel(
  startAt: Date,
  endAt: Date,
  locale: string,
  timeZone: string,
): { date: string; time: string } {
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(
    startAt,
  )
  const clock = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone })
  return { date, time: `${clock.format(startAt)}–${clock.format(endAt)}` }
}
