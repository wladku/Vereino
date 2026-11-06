// P-29 resolveAudience (foundation III REQ-M01, DD-M05): asks the provider registered for the audience's kind
// (`vereino.audience.<kind>`) for its members, the contact resolver (`vereino.contactResolver`, registered by `people`)
// for the minors' guardians, accounts, addresses, languages and the club's date, and applies the expansion rules of
// `@vereino/core`. Providers are optional registrations read with `hasRegistration`, so the foundation imports no
// business module and a missing provider fails closed (422 `audience_kind_unavailable`).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import {
  AUDIENCE_MAX_RECIPIENTS,
  CONTACT_RESOLVER_TOKEN,
  audienceCounts,
  audienceProviderToken,
  expandAudience,
  isAudienceKind,
  minorMemberIds,
  type AudienceContact,
  type AudienceCounts,
  type AudienceMember,
  type AudienceSpec,
  type CalendarDate,
  type Recipient,
  type Scope,
} from '@vereino/core'
import { foundationErrors } from '../api/errors'

/**
 * Who asks: the author's trusted tenant and organization and their scope (`scopeContract.resolve` or a job's
 * `system_job` grant); `em` is the caller's transactional EntityManager when the read must see its uncommitted rows.
 */
export type AudienceContext = {
  container: AwilixContainer
  tenantId: string
  organizationId: string
  scope: Scope
  em?: EntityManager
}

/** The context a provider gets: the caller's, plus the club's date the audience is resolved on. */
export type AudienceProviderContext = AudienceContext & { today: CalendarDate }

/**
 * Contract of `vereino.audience.<kind>`: the members of the audience (person ids with a reason), active on `today`.
 * The `persons` provider returns only the persons inside the author's scope; the resolver refuses the request when any
 * requested id is missing.
 */
export type AudienceProvider = {
  members(spec: AudienceSpec, ctx: AudienceProviderContext): Promise<AudienceMember[]>
}

/** The club facts an e-mail needs: its name (`EmailLayout`), its default language and today's date in its zone. */
export type ClubFacts = { name: string; defaultLocale: string; today: CalendarDate }

/**
 * Contract of `vereino.contactResolver` (registered by `people`): contacts with the address decrypted in memory only
 * and the language resolved person → club default, the active guardians of wards on a date, and the club facts.
 */
export type ContactResolver = {
  contacts(personIds: readonly string[], ctx: AudienceContext): Promise<AudienceContact[]>
  guardiansOf(personIds: readonly string[], today: CalendarDate, ctx: AudienceContext): Promise<Map<string, string[]>>
  club(ctx: AudienceContext): Promise<ClubFacts>
}

export type ResolvedAudience = {
  recipients: Recipient[]
  counts: AudienceCounts
  /** Person ids reached on no channel (also among `recipients`, without channels). */
  unreachable: string[]
  today: CalendarDate
}

/**
 * The contact resolver, or an uncoded 500 with the fingerprint `foundation.audience.contacts_unavailable` before
 * anything is written (a deployment without `people`).
 */
export function contactResolver(container: AwilixContainer): ContactResolver {
  if (!container.hasRegistration(CONTACT_RESOLVER_TOKEN)) {
    const error = Object.assign(new Error('[internal] no contact resolver is registered (vereino.contactResolver)'), {
      fingerprint: 'foundation.audience.contacts_unavailable',
    })
    getTelemetryRuntime()?.reportError(error, { module: 'foundation', code: error.fingerprint })
    throw error
  }
  return container.resolve<ContactResolver>(CONTACT_RESOLVER_TOKEN)
}

/** The provider for `kind`, or null when no module registered it. */
export function audienceProvider(container: AwilixContainer, kind: unknown): AudienceProvider | null {
  if (!isAudienceKind(kind)) return null
  const token = audienceProviderToken(kind)
  return container.hasRegistration(token) ? container.resolve<AudienceProvider>(token) : null
}

/**
 * Resolves an audience into deduplicated recipients with channels and languages (DD-M06). Throws 422
 * `audience_kind_unavailable` for a kind without a provider, 403 `scope_denied` when a `persons` id is outside the
 * author's scope, 422 `audience_too_large` above 2000 people; `exclude` drops the author.
 */
export async function resolveAudience(
  spec: AudienceSpec,
  ctx: AudienceContext,
  options: { exclude?: readonly string[] } = {},
): Promise<ResolvedAudience> {
  const provider = audienceProvider(ctx.container, spec.kind)
  if (!provider) return foundationErrors.throw('audience_kind_unavailable')
  const resolver = contactResolver(ctx.container)
  const club = await resolver.club(ctx)
  const members = await provider.members(spec, { ...ctx, today: club.today })
  if (spec.kind === 'persons') {
    const returned = new Set(members.map((member) => member.personId))
    if ((spec.ids ?? []).some((id) => !returned.has(id))) return foundationErrors.throw('scope_denied')
  }
  return expandMembers(members, ctx, resolver, club.today, options)
}

/**
 * Resolves members the caller has already chosen and authorized — no provider — into recipients by the same rules
 * as `resolveAudience` (DD-M06, DD-M18): contacts, the active guardians of minors, the expansion and the 2000 cap.
 * A member's direct thread (`communication.threads.start_direct`) names its subject and the addressed staff itself.
 */
export async function resolveMembers(
  members: readonly AudienceMember[],
  ctx: AudienceContext,
  options: { exclude?: readonly string[] } = {},
): Promise<ResolvedAudience> {
  const resolver = contactResolver(ctx.container)
  const club = await resolver.club(ctx)
  return expandMembers(members, ctx, resolver, club.today, options)
}

async function expandMembers(
  members: readonly AudienceMember[],
  ctx: AudienceContext,
  resolver: ContactResolver,
  today: CalendarDate,
  options: { exclude?: readonly string[] },
): Promise<ResolvedAudience> {
  const memberIds = [...new Set(members.map((member) => member.personId))]
  if (memberIds.length > AUDIENCE_MAX_RECIPIENTS) return foundationErrors.throw('audience_too_large')

  const memberContacts = await resolver.contacts(memberIds, ctx)
  const contacts = new Map(memberContacts.map((contact) => [contact.personId, contact]))
  const minors = minorMemberIds(members, contacts, today)
  const guardiansByWard =
    minors.length > 0 ? await resolver.guardiansOf(minors, today, ctx) : new Map<string, string[]>()
  const guardianIds = [...new Set([...guardiansByWard.values()].flat())].filter((id) => !contacts.has(id))
  if (guardianIds.length > 0) {
    for (const contact of await resolver.contacts(guardianIds, ctx)) contacts.set(contact.personId, contact)
  }

  const { recipients, unreachable } = expandAudience({ members, contacts, guardiansByWard }, today, options)
  if (recipients.length > AUDIENCE_MAX_RECIPIENTS) return foundationErrors.throw('audience_too_large')
  return {
    recipients: [...recipients],
    counts: audienceCounts(recipients),
    unreachable: [...unreachable],
    today,
  }
}
