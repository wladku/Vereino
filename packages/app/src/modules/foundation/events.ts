import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Events of the foundation (foundation III *Events, Jobs* rows; #71). `foundation.dispatch.delivery_failed` is emitted
 * once per delivery that ends `failed`, with ids only (S4.6): `{ id: deliveryId, dispatchId, tenantId, organizationId }`
 * — never the address, the subject or a secret.
 */
const events = [
  {
    id: 'foundation.dispatch.delivery_failed',
    label: 'Message delivery failed',
    entity: 'delivery',
    category: 'custom',
  },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'foundation', events })

/** Type-safe emitter for `foundation` events. */
export const emitFoundationEvent = eventsConfig.emit

export type FoundationEventId = (typeof events)[number]['id']

export default eventsConfig
