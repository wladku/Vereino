// `people:sync-auth-roles` (foundation spec DD-F05; club spec `people.role_assignment.*` row, TEST-005): recomputes the
// person's `auth` roles after a role assignment, guardianship or account change. Persistent, so a failed
// `auth.users.update` is retried by the queue; idempotent because the sync compares role sets.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { personIdOfAssignment, syncPersonRoles } from '../services/role-sync'

export const metadata = {
  event: 'people.*.*',
  persistent: true,
  id: 'people:sync-auth-roles',
}

const ASSIGNMENT_EVENTS = new Set([
  'people.role_assignment.created',
  'people.role_assignment.updated',
  'people.role_assignment.deleted',
])
const GUARDIANSHIP_EVENTS = new Set([
  'people.guardianship.created',
  'people.guardianship.updated',
  'people.guardianship.deleted',
])

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  personId: z.uuid().optional(),
  guardianPersonId: z.uuid().optional(),
})

type SubscriberContext = {
  resolve: (name: string) => unknown
  eventName?: string
  tenantId?: string | null
  organizationId?: string | null
}

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const eventName = ctx.eventName ?? ''
  const isAssignment = ASSIGNMENT_EVENTS.has(eventName)
  const isGuardianship = GUARDIANSHIP_EVENTS.has(eventName)
  if (!isAssignment && !isGuardianship && eventName !== 'people.person.account_created') return
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  // The emitter's trusted scope wins over the payload's (the payload only repeats it).
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  const container = await createRequestContainer()
  let personId: string | null = parsed.data.id
  if (isAssignment) personId = parsed.data.personId ?? (await personIdOfAssignment(container, scope, parsed.data.id))
  if (isGuardianship) personId = parsed.data.guardianPersonId ?? null
  if (!personId) return
  await syncPersonRoles(container, scope, personId)
}
