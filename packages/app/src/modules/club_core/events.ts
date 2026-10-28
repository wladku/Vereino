import { createModuleEvents } from '@open-mercato/shared/modules/events'

/** Events of `club_core`; payloads carry ids only (engineering standards S4.6). */
const events = [
  // Emitted after the club settings change; modules that cache settings invalidate on it (foundation DD-F16).
  { id: 'club_core.settings.updated', label: 'Club settings updated', entity: 'settings', category: 'crud' },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'club_core', events })

export type ClubCoreEventId = (typeof events)[number]['id']

export default eventsConfig
