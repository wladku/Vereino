import { createModuleEvents } from '@open-mercato/shared/modules/events'

/** Events of `club_core` (club spec API table: `club_core.{entity}.created|updated|deleted`); ids only (S4.6). */
const events = [
  // Emitted after the club settings change; modules that cache settings invalidate on it (foundation DD-F16).
  { id: 'club_core.settings.updated', label: 'Club settings updated', entity: 'settings', category: 'crud' },
  { id: 'club_core.section.created', label: 'Section created', entity: 'section', category: 'crud' },
  { id: 'club_core.section.updated', label: 'Section updated', entity: 'section', category: 'crud' },
  { id: 'club_core.section.deleted', label: 'Section deleted', entity: 'section', category: 'crud' },
  { id: 'club_core.place.created', label: 'Place created', entity: 'place', category: 'crud' },
  { id: 'club_core.place.updated', label: 'Place updated', entity: 'place', category: 'crud' },
  { id: 'club_core.place.deleted', label: 'Place deleted', entity: 'place', category: 'crud' },
  { id: 'club_core.institution.created', label: 'Institution created', entity: 'institution', category: 'crud' },
  { id: 'club_core.institution.updated', label: 'Institution updated', entity: 'institution', category: 'crud' },
  { id: 'club_core.institution.deleted', label: 'Institution deleted', entity: 'institution', category: 'crud' },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'club_core', events })

export type ClubCoreEventId = (typeof events)[number]['id']

export default eventsConfig
