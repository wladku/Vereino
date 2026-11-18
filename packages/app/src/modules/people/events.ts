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
