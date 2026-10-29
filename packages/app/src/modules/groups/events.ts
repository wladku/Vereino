import { createModuleEvents } from '@open-mercato/shared/modules/events'

/** Events of `groups` (club spec API table: `groups.group.*`, `groups.membership.*`); payloads carry ids only (S4.6). */
const events = [
  { id: 'groups.group.created', label: 'Group created', entity: 'group', category: 'crud' },
  { id: 'groups.group.updated', label: 'Group updated', entity: 'group', category: 'crud' },
  { id: 'groups.group.deleted', label: 'Group deleted', entity: 'group', category: 'crud' },
  { id: 'groups.membership.created', label: 'Membership created', entity: 'membership', category: 'crud' },
  { id: 'groups.membership.updated', label: 'Membership updated', entity: 'membership', category: 'crud' },
  { id: 'groups.membership.deleted', label: 'Membership deleted', entity: 'membership', category: 'crud' },
  { id: 'groups.season.created', label: 'Season created', entity: 'season', category: 'crud' },
  { id: 'groups.season.updated', label: 'Season updated', entity: 'season', category: 'crud' },
  { id: 'groups.season.deleted', label: 'Season deleted', entity: 'season', category: 'crud' },
  { id: 'groups.external_team.created', label: 'External team created', entity: 'external_team', category: 'crud' },
  { id: 'groups.external_team.updated', label: 'External team updated', entity: 'external_team', category: 'crud' },
  { id: 'groups.external_team.deleted', label: 'External team deleted', entity: 'external_team', category: 'crud' },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'groups', events })

/** Type-safe emitter for `groups` events. */
export const emitGroupsEvent = eventsConfig.emit

export type GroupsEventId = (typeof events)[number]['id']

export default eventsConfig
