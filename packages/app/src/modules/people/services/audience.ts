// The audience pieces `people` owns (foundation III P-29, DD-M05, DD-M06; #71):
// - `vereino.audience.club`: the participants and coaches of every live, active group (through the optional `groups`
//   contribution) plus the persons with an active `coach` role assignment — the club spec's *Thread* rule members;
// - `vereino.audience.persons`: the named persons, only those inside the author's scope (club administrator: anyone;
//   coordinator: people with a role in their sections and the members of their sections' groups; coach: the members of
//   their groups) — the foundation refuses the whole request when one id is missing (403 `scope_denied`);
// - `vereino.contactResolver`: accounts, decrypted addresses (in memory only), languages person → club default, birth
//   dates and names; the active guardians of wards; the club's name, default language and date.
import type { EntityManager } from '@mikro-orm/postgresql'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Organization } from '@open-mercato/core/modules/directory/data/entities'
import {
  audienceProviderToken,
  hasKind,
  type AudienceContact,
  type AudienceMember,
  type AudienceSpec,
  type CalendarDate,
  type Scope,
} from '@vereino/core'
import {
  localeForPerson,
  type AudienceContext,
  type AudienceProvider,
  type AudienceProviderContext,
  type ClubFacts,
  type ContactResolver,
} from '@/modules/foundation'
import { Person, RoleAssignment } from '../data/entities'
import { clubSettings, clubToday, type ClubScope } from './club-clock'
import { membershipContribution } from './membership-contribution'
import { activeGuardians } from './person-directory'

function emOf(ctx: AudienceContext): EntityManager {
  return ctx.em ?? ctx.container.resolve<EntityManager>('em').fork()
}

function scopeOf(ctx: AudienceContext): ClubScope {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

const activeOn = (today: CalendarDate) => ({
  deletedAt: null,
  validFrom: { $lte: today },
  $or: [{ validTo: null }, { validTo: { $gte: today } }],
})

/** Persons with an active role assignment of `role` (in `sectionIds` when given). */
async function personsWithRole(
  em: EntityManager,
  scope: ClubScope,
  role: RoleAssignment['role'],
  today: CalendarDate,
  sectionIds?: readonly string[],
): Promise<string[]> {
  const rows = await em.find(
    RoleAssignment,
    { ...scope, role, ...(sectionIds ? { sectionId: { $in: [...sectionIds] } } : {}), ...activeOn(today) },
    { fields: ['id', 'personId'] },
  )
  return [...new Set(rows.map((row) => row.personId))]
}

/** The members another kind's provider returns, or none when that provider is not registered. */
async function membersOfKind(
  ctx: AudienceProviderContext,
  kind: 'section' | 'group',
  ids: readonly string[],
): Promise<AudienceMember[]> {
  const token = audienceProviderToken(kind)
  if (ids.length === 0 || !ctx.container.hasRegistration(token)) return []
  return ctx.container.resolve<AudienceProvider>(token).members({ kind, ids }, ctx)
}

function grantIds(scope: Scope, kind: 'coordinator' | 'coach'): string[] {
  return [...new Set(scope.filter((grant) => grant.kind === kind).flatMap((grant) => grant.ids ?? []))]
}

/** The person ids among `ids` the author may address directly, or null when every person of the club is allowed. */
async function addressablePersons(ctx: AudienceProviderContext, ids: readonly string[]): Promise<Set<string> | null> {
  if (hasKind(ctx.scope, 'club_admin') || hasKind(ctx.scope, 'system_job')) return null
  const em = emOf(ctx)
  const scope = scopeOf(ctx)
  const sectionIds = grantIds(ctx.scope, 'coordinator')
  const groupIds = grantIds(ctx.scope, 'coach')
  const allowed = new Set<string>()
  if (sectionIds.length > 0) {
    for (const role of ['coordinator', 'coach'] as const) {
      for (const id of await personsWithRole(em, scope, role, ctx.today, sectionIds)) allowed.add(id)
    }
    for (const member of await membersOfKind(ctx, 'section', sectionIds)) allowed.add(member.personId)
  }
  for (const member of await membersOfKind(ctx, 'group', groupIds)) allowed.add(member.personId)
  return new Set(ids.filter((id) => allowed.has(id)))
}

/** `vereino.audience.persons`: the named live persons inside the author's scope, as `direct` members. */
export const personsAudienceProvider: AudienceProvider = {
  async members(spec: AudienceSpec, ctx: AudienceProviderContext) {
    const ids = [...new Set(spec.ids ?? [])]
    if (ids.length === 0) return []
    const live = await emOf(ctx).find(
      Person,
      { ...scopeOf(ctx), id: { $in: ids }, deletedAt: null },
      { fields: ['id'] },
    )
    const allowed = await addressablePersons(ctx, ids)
    return live
      .filter((person) => !allowed || allowed.has(person.id))
      .map((person) => ({ personId: person.id, reason: 'direct' as const }))
  },
}

/** `vereino.audience.club`: every group member of the club and every person with an active `coach` role. */
export const clubAudienceProvider: AudienceProvider = {
  async members(_spec: AudienceSpec, ctx: AudienceProviderContext) {
    const em = emOf(ctx)
    const scope = scopeOf(ctx)
    const contribution = membershipContribution(ctx.container)
    const groupMembers = contribution ? await contribution.activeMembers(em, scope, ctx.today) : []
    const coaches = await personsWithRole(em, scope, 'coach', ctx.today)
    return [...groupMembers, ...coaches.map((personId) => ({ personId, reason: 'coach' as const }))]
  },
}

/** The club's display name: the short name from the club settings, else the organization's name. */
async function clubName(em: EntityManager, scope: ClubScope, shortName: string | null): Promise<string> {
  if (shortName) return shortName
  // The organization's name is encrypted at rest; read it the way `club_core`'s public site does.
  const organization = await findOneWithDecryption(
    em,
    Organization,
    { id: scope.organizationId, tenant: scope.tenantId, deletedAt: null },
    undefined,
    scope,
  )
  return organization?.name ?? ''
}

export function createContactResolver(): ContactResolver {
  return {
    async contacts(personIds, ctx) {
      const unique = [...new Set(personIds)]
      if (unique.length === 0) return []
      const scope = scopeOf(ctx)
      const settings = await clubSettings(ctx.container, scope)
      const rows = await findWithDecryption(
        emOf(ctx),
        Person,
        { ...scope, id: { $in: unique }, deletedAt: null },
        { fields: ['id', 'firstName', 'lastName', 'email', 'preferredLocale', 'birthDate', 'userId'] },
        scope,
      )
      return rows.map((row): AudienceContact => ({
        personId: row.id,
        name: `${row.firstName} ${row.lastName}`.trim(),
        userId: row.userId ?? null,
        email: row.email?.trim() || null,
        locale: localeForPerson(row, settings.defaultLocale),
        birthDate: row.birthDate ?? null,
      }))
    },
    async guardiansOf(personIds, today, ctx) {
      return activeGuardians(emOf(ctx), scopeOf(ctx), personIds, today)
    },
    async club(ctx): Promise<ClubFacts> {
      const scope = scopeOf(ctx)
      const settings = await clubSettings(ctx.container, scope)
      return {
        name: await clubName(emOf(ctx), scope, settings.shortName),
        defaultLocale: settings.defaultLocale,
        today: await clubToday(ctx.container, scope),
      }
    },
  }
}
