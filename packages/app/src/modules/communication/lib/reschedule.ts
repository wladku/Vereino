// The texts of a moved session (groups and activities parity spec REQ-A09, D-031 §7; J-A03 step 3; #271): the system
// message of the session thread ("Moved by Ewa Nowak (coordinator): Tue 18.11 17:00, Boisko piłkarskie → Wed 19.11
// 17:00, Sala gimnastyczna") and the e-mail `communication.session_moved` — a move with the old and the new time,
// place and gathering time, a restore ("takes place after all"), or a series change naming the first changed date, the
// number of changed sessions and the new rule. The caller passes the translator of the language it writes in: the
// club's for the thread message, the recipient's for the e-mail. Pure.
import type { CancellingRole } from '@vereino/core'

/** Where and when a session takes place, as a notice names it (instants as ISO strings). */
export type ReschedulePoint = { startAt: string; endAt: string; gatheringAt: string | null; place: string }

/** A series rule as a notice names it: local times, the gathering offset and the place. */
export type RescheduleRule = {
  startTime: string
  endTime: string
  gatheringMinutesBefore: number | null
  place: string
}

export type RescheduleNotice =
  | { kind: 'moved'; before: ReschedulePoint; after: ReschedulePoint }
  | { kind: 'restored'; after: ReschedulePoint }
  | { kind: 'series'; from: string; movedCount: number; before: RescheduleRule; after: RescheduleRule }

/** Who made the change (R01): their name and a known acting role. */
export type RescheduleActor = { name: string; role: CancellingRole }

export type RescheduleContext = { activityName: string; locale: string; timeZone: string }

/** A translator with a fallback text and values (the platform's `TranslateWithFallbackFn` fits it). */
export type Translate = (key: string, fallback: string, values?: Record<string, string>) => string

const KEY = 'communication.email.sessionMoved'

/** "Tue 18.11" — the short weekday and the day and month of an instant, in `timeZone`. */
export function shortDateLabel(at: Date, locale: string, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone }).format(at)
  const parts = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', timeZone }).formatToParts(at)
  const byType = Object.fromEntries(parts.map((entry) => [entry.type, entry.value])) as Record<string, string>
  return `${weekday} ${byType.day}.${byType.month}`
}

function clock(at: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(at)
}

/** "Tue 18.11 17:00 (gathering 16:30), Boisko piłkarskie". */
export function pointLabel(t: Translate, point: ReschedulePoint, ctx: RescheduleContext): string {
  const startAt = new Date(point.startAt)
  const values = {
    date: shortDateLabel(startAt, ctx.locale, ctx.timeZone),
    time: clock(startAt, ctx.locale, ctx.timeZone),
    gathering: point.gatheringAt ? clock(new Date(point.gatheringAt), ctx.locale, ctx.timeZone) : '',
    place: point.place,
  }
  return point.gatheringAt
    ? t(`${KEY}.pointWithGathering`, '{date} {time} (gathering {gathering}), {place}', values)
    : t(`${KEY}.point`, '{date} {time}, {place}', values)
}

/** "17:00–18:30 (gathering 30 min before), Boisko piłkarskie". */
export function ruleLabel(t: Translate, rule: RescheduleRule): string {
  const values = {
    time: `${rule.startTime.slice(0, 5)}–${rule.endTime.slice(0, 5)}`,
    gathering: String(rule.gatheringMinutesBefore ?? ''),
    place: rule.place,
  }
  return rule.gatheringMinutesBefore
    ? t(`${KEY}.ruleWithGathering`, '{time} (gathering {gathering} min before), {place}', values)
    : t(`${KEY}.rule`, '{time}, {place}', values)
}

/** "18.11.2026" — a calendar date (`YYYY-MM-DD`) as the series notice names its first changed day. */
export function dayLabel(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day}.${month}.${year}`
}

/** The subject and the one-line change of a notice, by whom when the actor is known. */
export function rescheduleLines(
  t: Translate,
  notice: RescheduleNotice,
  ctx: RescheduleContext,
  actor: RescheduleActor | null,
): { subject: string; lead: string } {
  const by = actor ? { name: actor.name, role: t(`communication.roles.${actor.role}`, actor.role) } : null
  const activity = ctx.activityName
  if (notice.kind === 'series') {
    const values = {
      activity,
      from: dayLabel(notice.from),
      count: String(notice.movedCount),
      before: ruleLabel(t, notice.before),
      after: ruleLabel(t, notice.after),
      ...by,
    }
    return {
      subject: t(`${KEY}.seriesSubject`, 'Schedule changed: {activity}', values),
      lead: by
        ? t(
            `${KEY}.seriesBy`,
            'Schedule changed by {name} ({role}): from {from}, {count} sessions: {before} → {after}',
            values,
          )
        : t(`${KEY}.series`, 'Schedule changed: from {from}, {count} sessions: {before} → {after}', values),
    }
  }
  const to = pointLabel(t, notice.after, ctx)
  const date = shortDateLabel(new Date(notice.after.startAt), ctx.locale, ctx.timeZone)
  if (notice.kind === 'restored') {
    const values = { activity, date, to, ...by }
    return {
      subject: t(`${KEY}.restoredSubject`, 'Takes place after all: {activity}, {date}', values),
      lead: by
        ? t(`${KEY}.restoredBy`, 'Takes place after all, restored by {name} ({role}): {to}', values)
        : t(`${KEY}.restored`, 'Takes place after all: {to}', values),
    }
  }
  const values = { activity, date, from: pointLabel(t, notice.before, ctx), to, ...by }
  return {
    subject: t(`${KEY}.subject`, 'Moved: {activity}, {date}', values),
    lead: by
      ? t(`${KEY}.movedBy`, 'Moved by {name} ({role}): {from} → {to}', values)
      : t(`${KEY}.moved`, 'Moved: {from} → {to}', values),
  }
}
