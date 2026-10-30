// P-24 parse service (foundation II DD-G01, DD-G14): turns a stored or submitted rule into a `Recurrence` or the
// coded 422 — `recurrence_unsupported` naming the part outside the subset, `recurrence_invalid` with its reason
// (including an end before the first day). The maths is `@vereino/core`'s; this file only maps its typed result.
import { Recurrence, type CalendarDate, type Recurrence as RecurrenceRule } from '@vereino/core'
import { foundationErrors } from '../api/errors'

export type ParseRecurrenceInput = {
  /** The RRULE value, optionally with an `EXDATE` line (the stored text). */
  rrule: string
  /** Exception dates given separately (`YYYY-MM-DD`). */
  exdates?: readonly CalendarDate[]
  /** The series' first day: an `UNTIL` before it is invalid. */
  startsOn: CalendarDate
}

export async function parseRecurrence(input: ParseRecurrenceInput): Promise<RecurrenceRule> {
  const result = Recurrence.parse(input.rrule, input.exdates ?? [])
  if (!result.ok) {
    const { error } = result
    if (error.code === 'recurrence_unsupported') return foundationErrors.throw(error.code, { part: error.part })
    return foundationErrors.throw(error.code, { reason: error.reason })
  }
  const startProblem = Recurrence.checkStart(result.value, input.startsOn)
  if (startProblem?.code === 'recurrence_invalid') {
    return foundationErrors.throw(startProblem.code, { reason: startProblem.reason })
  }
  return result.value
}
