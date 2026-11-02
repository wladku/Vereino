import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Events of `communication` (foundation III *Events, Jobs, Notifications*; the club spec's ids): payloads carry ids
 * only (S4.6). `communication.case.opened` (`{ id: threadId }`) is emitted once, when a thread is marked as a case
 * (phase C, #36).
 */
const events = [
  { id: 'communication.thread.created', label: 'Thread created', entity: 'thread', category: 'crud' },
  { id: 'communication.message.posted', label: 'Message posted', entity: 'thread_message', category: 'custom' },
  { id: 'communication.message.updated', label: 'Message edited', entity: 'thread_message', category: 'custom' },
  { id: 'communication.message.deleted', label: 'Message deleted', entity: 'thread_message', category: 'custom' },
  { id: 'communication.case.opened', label: 'Case opened', entity: 'thread', category: 'custom' },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'communication', events })

/** Type-safe emitter for `communication` events. */
export const emitCommunicationEvent = eventsConfig.emit

export type CommunicationEventId = (typeof events)[number]['id']

export default eventsConfig
