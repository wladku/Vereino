// The coaches' contact list behind `GET /api/activities/occurrences/{id}/guardian-contacts` (club spec REQ-037, DD-39,
// API row, TEST-052; foundation II J-G03; #34): the phone and e-mail of the guardians of the session's participants
// who consent (`share_contact_with_coaches_at`) and have an account. Only a coach of the session's group, or the coach
// assigned to the session, reads it — not the coordinator or the administrator (data minimisation: the consent names
// the coaches). The children are the session's participants who are still in the group today (a past session never
// reveals the guardians of children who left), and the coach assigned from another group reads only until a day after
// the session ends. Every read, even an empty one, commits a `ContactAccessLog` row with the person ids before the
// values are read (`auditedRead`); a withdrawn consent drops the guardian from the next read.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { GrantKind } from '@vereino/core'
import { assertInScope, auditedRead, foundationErrors, scopeContract } from '@/modules/foundation'
import { checkOffRole, checkOffTarget } from '../commands/check-off'
import { ContactAccessLog, Occurrence } from '../data/entities'
import {
  activeGuardians,
  clubClock,
  contactConsents,
  findPersons,
  rosterOn,
  sharedContacts,
  type ActivitiesScope,
} from './directory'

/** Who reads the contacts: a coach of the group, or the session's assigned coach (`self` on `coachPersonId`). */
export const CONTACT_READ_KINDS: readonly GrantKind[] = ['coach', 'self']

/** How long after a session its assigned coach from another group still reads its guardians' contacts. */
export const ASSIGNED_COACH_CONTACTS_HOURS = 24

export const CONTACTS_PURPOSE = 'coach_contacts'
export const CONTACTS_RESOURCE_KIND = 'people:person'

export type GuardianContact = {
  personId: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  /** The session's participants this person is an active guardian of. */
  wards: { personId: string; firstName: string; lastName: string }[]
}

export type GuardianContactsPage = {
  items: GuardianContact[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** The consenting guardians' contacts of one session, or null when the session does not exist in the organization. */
export async function readGuardianContacts(
  ctx: CommandRuntimeContext,
  scope: ActivitiesScope,
  id: string,
  now: Date = new Date(),
): Promise<GuardianContactsPage | null> {
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const occurrence = await em.findOne(Occurrence, { id, ...scope, deletedAt: null })
  if (!occurrence) return null
  const grants = await scopeContract.resolve(ctx)
  const grantKind = await assertInScope(grants, CONTACT_READ_KINDS, checkOffTarget(occurrence))
  // The assigned coach of another group (`self` on the session's coach) reads only around the session.
  if (grantKind === 'self' && now.getTime() > occurrence.endAt.getTime() + ASSIGNED_COACH_CONTACTS_HOURS * 3_600_000) {
    await foundationErrors.throw('scope_denied')
  }
  const actingRole = checkOffRole(grantKind)
  const { today } = await clubClock(ctx.container, scope, now)
  const participantsOn = async (date: string) =>
    new Set(
      (await rosterOn(ctx.container, scope, occurrence.groupId, date, em))
        .filter((member) => member.role === 'participant')
        .map((member) => member.personId),
    )
  const [onSessionDay, onToday] = await Promise.all([participantsOn(occurrence.occurrenceDate), participantsOn(today)])
  const wardIds = [...onSessionDay].filter((personId) => onToday.has(personId))
  const guardiansByWard = await activeGuardians(ctx.container, scope, wardIds, today, em)
  const guardianIds = [...new Set([...guardiansByWard.values()].flat())]
  const consenting = [...(await contactConsents(ctx.container, scope, guardianIds))].sort()
  const contacts = await auditedRead(
    ctx,
    {
      log: ContactAccessLog,
      scope,
      actingRole,
      resourceKind: CONTACTS_RESOURCE_KIND,
      resourceIds: consenting,
      purpose: CONTACTS_PURPOSE,
      fields: ['phone', 'email'],
      extra: { occurrenceId: occurrence.id },
    },
    () => sharedContacts(ctx.container, scope, consenting),
  )
  const wards = await findPersons(ctx.container, scope, wardIds, em)
  const items = [...contacts.values()]
    .map((contact): GuardianContact => ({
      personId: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
      email: contact.email,
      wards: wardIds
        .filter((wardId) => (guardiansByWard.get(wardId) ?? []).includes(contact.id))
        .flatMap((wardId) => {
          const ward = wards.get(wardId)
          return ward ? [{ personId: ward.id, firstName: ward.firstName, lastName: ward.lastName }] : []
        }),
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
  return { items, total: items.length, page: 1, pageSize: Math.max(items.length, 1), totalPages: 1 }
}
