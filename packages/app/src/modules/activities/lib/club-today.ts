// The `/club` Today tiles (club spec `/club` *Behavior*, README M-02; REQ-006, REQ-007; E06-S16, #98): which sessions
// the calendar tile lists, the session it names when today and tomorrow are empty, the notices of one card, whether a
// person's declaration buttons show, and the success message of a declaration. Pure: the widget passes the club-zone
// "today" and "tomorrow".

export type TodaySessionStatus = 'planned' | 'done' | 'cancelled'

/** The slice of a calendar entry these rules read. */
export type TodayEntry = {
  occurrence: { occurrenceDate: string; startAt: string; status: TodaySessionStatus; cancelReason: string | null }
  declarationsOpen: boolean
}

/** The slice of a calendar person these rules read. */
export type TodayPerson = { canDeclare: boolean; guardianOnly: boolean }

export type TodayPerspective = 'self' | 'guardian' | 'coach'

function byStart<T extends TodayEntry>(left: T, right: T): number {
  return left.occurrence.startAt.localeCompare(right.occurrence.startAt)
}

/**
 * The sessions of today and tomorrow in start order (`soon`), and — when there are none — the first session after
 * tomorrow that is not cancelled (`next`), from the entries the tile already read.
 */
export function splitTodaySessions<T extends TodayEntry>(
  entries: readonly T[],
  today: string,
  tomorrow: string,
): { soon: T[]; next: T | null } {
  const soon = entries
    .filter((entry) => entry.occurrence.occurrenceDate === today || entry.occurrence.occurrenceDate === tomorrow)
    .sort(byStart)
  if (soon.length > 0) return { soon, next: null }
  const later = entries
    .filter((entry) => entry.occurrence.occurrenceDate > tomorrow && entry.occurrence.status !== 'cancelled')
    .sort(byStart)
  return { soon, next: later[0] ?? null }
}

export type TodayNotice = { kind: 'cancelled'; reason: string | null } | { kind: 'closed' }

/** "Cancelled" (with its reason) or "Declarations closed" (a planned session that has started); none otherwise. */
export function todayEntryNotice(entry: TodayEntry): TodayNotice | null {
  if (entry.occurrence.status === 'cancelled') return { kind: 'cancelled', reason: entry.occurrence.cancelReason }
  if (entry.occurrence.status === 'planned' && !entry.declarationsOpen) return { kind: 'closed' }
  return null
}

/**
 * The person's declaration buttons on a Today card: `hidden` for the coach's view, a session that is not planned, and a
 * ward signed in under `guardian_only`; `disabled` once declarations are closed; `enabled` otherwise. The declare
 * route keeps the rules (403 `guardian_only`, 409 `declaration_closed`); this only mirrors them.
 */
export function declarationButtons(
  entry: TodayEntry,
  person: TodayPerson,
  as: TodayPerspective,
): 'hidden' | 'disabled' | 'enabled' {
  if (as === 'coach' || entry.occurrence.status !== 'planned' || person.guardianOnly) return 'hidden'
  return entry.declarationsOpen && person.canDeclare ? 'enabled' : 'disabled'
}

/** "Thu" and "16:00": the weekday and time of a session start in the club zone, 24-hour clock whatever the locale. */
export function weekdayAndTime(at: Date, locale: string, timeZone: string): { day: string; time: string } {
  return {
    day: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone }).format(at),
    time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(
      at,
    ),
  }
}

/** "Sat, Nov 7, 10:00": the weekday, date and time of a session start in the club zone. */
export function sessionMoment(at: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(at)
}

const SAVED_KEYS = {
  yes: 'activities.club.flash.savedAttending',
  no: 'activities.club.flash.savedNotAttending',
  unknown: 'activities.club.flash.savedWithdrawn',
} as const

/** The i18n key of "Saved: {name} attending" / "… not attending" / "… absence withdrawn". */
export function savedDeclarationKey(declared: keyof typeof SAVED_KEYS): string {
  return SAVED_KEYS[declared]
}
