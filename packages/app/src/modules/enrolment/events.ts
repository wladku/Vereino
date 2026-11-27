import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Events of `enrolment` (sign-up form spec *Events, Jobs, Notifications*; #799): payloads carry ids and the state only,
 * never a name or an address (S4.6). `decision` of `.decided` is `rejected` or `waiting` in phase 2; `accepted` and
 * `trial` come with phases 3 and 4. `.expired` is the season-end rule of phase 3.
 */
const events = [
  { id: 'enrolment.application.confirmed', label: 'Application confirmed', entity: 'application', category: 'custom' },
  { id: 'enrolment.application.decided', label: 'Application decided', entity: 'application', category: 'custom' },
  { id: 'enrolment.application.withdrawn', label: 'Application withdrawn', entity: 'application', category: 'custom' },
  { id: 'enrolment.application.expired', label: 'Application expired', entity: 'application', category: 'custom' },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'enrolment', events })

/** Type-safe emitter for `enrolment` events. */
export const emitEnrolmentEvent = eventsConfig.emit

export type EnrolmentEventId = (typeof events)[number]['id']

export default eventsConfig
