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
