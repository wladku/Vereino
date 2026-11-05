// Formatting the `communication` e-mails need (foundation III P-31 templates in `emails/`): a session's date and time
// in the club's zone and the recipient's language, and the preheader excerpt. Pure.
import { excerpt } from './thread-rules'

/** A session's date ("Tuesday, 3 November") and time range ("17:00–18:30") in `timeZone`, for `locale`. */
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

/** A wall-clock time ("16:30") in `timeZone`, for `locale` — the gathering time of a session (club spec DD-43). */
export function clockLabel(at: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(at)
}

/** The preheader of a message e-mail: the first words of the club text. */
export function preheaderOf(body: string): string {
  return excerpt(body, 120)
}
