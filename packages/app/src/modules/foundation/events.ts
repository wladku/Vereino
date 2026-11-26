import { createModuleEvents } from '@open-mercato/shared/modules/events'

/**
 * Events of the foundation (foundation III *Events, Jobs* rows; #71). `foundation.dispatch.delivery_failed` is emitted
 * once per delivery that ends `failed`, with ids only (S4.6): `{ id: deliveryId, dispatchId, tenantId, organizationId }`
 * — never the address, the subject or a secret. The `foundation.identity.*` events (#566) carry
 * `{ id, userId, provider, tenantId, organizationId }` — never the provider subject or the e-mail.
 */
const events = [
  {
    id: 'foundation.dispatch.delivery_failed',
    label: 'Message delivery failed',
    entity: 'delivery',
    category: 'custom',
  },
  // Social sign-in (#566): ids only — `{ id, userId, provider, tenantId, organizationId }` (S4.6).
  { id: 'foundation.identity.linked', label: 'Sign-in identity linked', entity: 'identity_link', category: 'custom' },
  {
    id: 'foundation.identity.unlinked',
    label: 'Sign-in identity unlinked',
    entity: 'identity_link',
    category: 'custom',
  },
  {
    id: 'foundation.identity.signed_in',
    label: 'Signed in with a linked identity',
    entity: 'identity_link',
    category: 'custom',
  },
  // Staff second factor (#736): ids only — `{ id, userId, tenantId, organizationId, method }`, and `actorUserId` on
  // `reset` (S4.6); never a code, a challenge id or an address.
  {
    id: 'foundation.second_factor.challenged',
    label: 'Second factor challenged',
    entity: 'second_factor',
    category: 'custom',
  },
  { id: 'foundation.second_factor.verified', label: 'Second factor verified', entity: 'second_factor', category: 'custom' },
  {
    id: 'foundation.second_factor.locked',
    label: 'Second factor challenge locked',
    entity: 'second_factor',
    category: 'custom',
  },
  { id: 'foundation.second_factor.reset', label: 'Second factor reset', entity: 'second_factor', category: 'custom' },
] as const

export const eventsConfig = createModuleEvents({ moduleId: 'foundation', events })

/** Type-safe emitter for `foundation` events. */
export const emitFoundationEvent = eventsConfig.emit

export type FoundationEventId = (typeof events)[number]['id']

export default eventsConfig
