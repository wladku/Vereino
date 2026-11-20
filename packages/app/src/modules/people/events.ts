import { createModuleEvents } from '@open-mercato/shared/modules/events'

/** Events of `people` (club spec *Events*); payloads carry ids only (engineering standards S4.6). */
const events = [
  { id: 'people.person.created', label: 'Person created', entity: 'person', category: 'crud' },
  { id: 'people.person.updated', label: 'Person updated', entity: 'person', category: 'crud' },
  { id: 'people.person.deleted', label: 'Person deleted', entity: 'person', category: 'crud' },
  {
    id: 'people.person.account_created',
    label: 'Account created for a person',
    entity: 'person',
    category: 'lifecycle',
  },
  // People life-cycle spec phase L1 (#303): the login e-mail or the block of the person's account changed; the
  // account was closed (the platform user deleted). Ids only.
  {
    id: 'people.person.account_updated',
    label: "Person's account updated",
    entity: 'person',
    category: 'lifecycle',
  },
  {
    id: 'people.person.account_closed',
    label: "Person's account closed",
    entity: 'person',
    category: 'lifecycle',
  },
  // People life-cycle spec phase L4 (REQ-L03; #306): a member's departure request was filed (payload carries the batch
  // id, which keys the administrators' notice) and a person's departure was confirmed (one event per person, with
  // the last day). Ids and dates only.
  {
    id: 'people.departure_request.created',
    label: 'Departure request filed',
    entity: 'departure_request',
    category: 'lifecycle',
  },
  { id: 'people.person.departed', label: 'Person left the club', entity: 'person', category: 'lifecycle' },
  // People life-cycle spec phase L8 (REQ-L06, DD-L08; #310): the daily job ended a ward's guardianships on the 18th
  // birthday. Payload `{ id, tenantId, organizationId, birthday }` (ids and the date of the change only); `activities`
  // makes the person's `pending_guardian` declarations of sessions from that day final.
  { id: 'people.person.came_of_age', label: 'Person came of age', entity: 'person', category: 'lifecycle' },
  // People life-cycle spec phase L6 (REQ-L05; #308): a former person was anonymised. Payload `{ id, tenantId,
  // organizationId }` (ids only); the `people` search tokens are dropped and `facilities` clears the person's contact
  // snapshots on rentals. `people.person.deleted` (above) is emitted for the first time by `people.persons.delete`.
  { id: 'people.person.anonymized', label: 'Person anonymised', entity: 'person', category: 'lifecycle' },
  {
    id: 'people.role_assignment.created',
    label: 'Role assignment created',
    entity: 'role_assignment',
    category: 'crud',
  },
  {
    id: 'people.role_assignment.updated',
    label: 'Role assignment updated',
    entity: 'role_assignment',
    category: 'crud',
  },
  {
    id: 'people.role_assignment.deleted',
    label: 'Role assignment deleted',
    entity: 'role_assignment',
    category: 'crud',
  },
  // Payload `{ id, tenantId, organizationId, guardianPersonId, wardPersonId }` (`wardPersonId` since #295, Contract 6).
  { id: 'people.guardianship.created', label: 'Guardianship created', entity: 'guardianship', category: 'crud' },
  { id: 'people.guardianship.updated', label: 'Guardianship updated', entity: 'guardianship', category: 'crud' },
  { id: 'people.guardianship.deleted', label: 'Guardianship deleted', entity: 'guardianship', category: 'crud' },
  // A bulk import was committed (#28, club spec *Events*): ids only; the audit entry carries the counts and the ids.
  { id: 'people.import.committed', label: 'People import committed', entity: 'import', category: 'lifecycle' },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'people', events })

/** Type-safe emitter for `people` events. */
export const emitPeopleEvent = eventsConfig.emit

export type PeopleEventId = (typeof events)[number]['id']

export default eventsConfig
