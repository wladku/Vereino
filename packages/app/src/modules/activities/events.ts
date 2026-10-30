import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Events of `activities` (club spec API table and *Events, Jobs, Notifications*): payloads carry ids only (S4.6).
 * `activities.occurrence.generated` is batched per activity and names the sessions a write created, changed or removed.
 */
const events = [
  { id: 'activities.activity.created', label: 'Activity created', entity: 'activity', category: 'crud' },
  { id: 'activities.activity.updated', label: 'Activity updated', entity: 'activity', category: 'crud' },
  { id: 'activities.activity.deleted', label: 'Activity deleted', entity: 'activity', category: 'crud' },
  { id: 'activities.occurrence.generated', label: 'Sessions generated', entity: 'occurrence', category: 'custom' },
  { id: 'activities.occurrence.updated', label: 'Session updated', entity: 'occurrence', category: 'crud' },
  { id: 'activities.occurrence.cancelled', label: 'Session cancelled', entity: 'occurrence', category: 'custom' },
  // #32: declarations carry the attendance, session and person ids, the status and the guardian's user ids to notify.
  { id: 'activities.attendance.declared', label: 'Attendance declared', entity: 'attendance', category: 'custom' },
  {
    id: 'activities.attendance.guardian_decided',
    label: 'Guardian decided on a declaration',
    entity: 'attendance',
    category: 'custom',
  },
  {
    id: 'activities.attendance_policy.created',
    label: 'Attendance policy created',
    entity: 'attendance_policy',
    category: 'crud',
  },
  {
    id: 'activities.attendance_policy.updated',
    label: 'Attendance policy updated',
    entity: 'attendance_policy',
    category: 'crud',
  },
  {
    id: 'activities.attendance_policy.deleted',
    label: 'Attendance policy deleted',
    entity: 'attendance_policy',
    category: 'crud',
  },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'activities', events })

/** Type-safe emitter for `activities` events. */
export const emitActivitiesEvent = eventsConfig.emit

export type ActivitiesEventId = (typeof events)[number]['id']

export default eventsConfig
