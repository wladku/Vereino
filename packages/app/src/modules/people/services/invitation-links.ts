// Personal invitation links (personal invitation link spec REQ-IL01…REQ-IL05, IL-D01…IL-D05; foundation P-10, DD-35;
// #868). A staff member takes a link for a person whose account is still invited (`people.persons.share_invitation`);
// the guardian opens `/club/i/[token]` on the club's address, sees only the club, and starts the platform's own
// password setup from it.
//
// System scope (Q-IL05, approved by the owner on 2026-11-26 on #868; recorded in `AGENTS.md`): `inspectInvitationLink`
// and `startInvitationLink` run the one read-only, index-backed lookup of `people_invitation_links.token_hash`
// (`TokenLinkService.inspect` / `redeem`) and narrow every further query at once to the tenant and organization of the
// found link. Nothing here logs, audits or stores the raw token.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { getSecurityEmailBaseUrl } from '@open-mercato/shared/lib/url'
import { clubOrigin, type CalendarDate } from '@vereino/core'
import { accountView, passwordSetupLink, type TokenLinkService } from '@/modules/foundation'
import { Guardianship, InvitationLink, Person } from '../data/entities'
import {
  groupInReach,
  invitationLinkPath,
  invitationLinkProblem,
  pendingListReads,
  type InvitationLinkProblem,
  type ShareReach,
  type WardGroup,
} from '../lib/invitation-links'
import { createContactResolver } from './audience'
import { clubToday, type ClubScope } from './club-clock'
import { membershipContribution, type ParticipantGroup } from './membership-contribution'

/** DI token of the `people_invitation_links` link service (`di.ts`). */
export const PEOPLE_INVITATION_LINKS = 'people.invitationLinks'

export type InvitationLinkService = TokenLinkService<InvitationLink>

export function invitationLinkService(container: AwilixContainer): InvitationLinkService {
  return container.resolve<InvitationLinkService>(PEOPLE_INVITATION_LINKS)
}

/** The club's name and the base of its links: its address when it has one (many clubs spec REQ-M03), else `APP_URL`. */
export async function clubOfScope(
  container: AwilixContainer,
  scope: ClubScope,
  em?: EntityManager,
): Promise<{ name: string; baseUrl: string }> {
  const club = await createContactResolver().club({ container, ...scope, scope: [], em })
  return { name: club.name, baseUrl: clubOrigin(club.publicSlug, process.env) ?? getSecurityEmailBaseUrl(undefined) }
}

/** The absolute URL of a link on the club's address. */
export function invitationLinkUrl(baseUrl: string, rawToken: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${invitationLinkPath(rawToken)}`
}

/**
 * Issues a new link of the person in `em`'s transaction and revokes every earlier unrevoked one (REQ-IL05: only the
 * newest works). Returns the raw token once, for the issuing response only.
 */
export async function issueInvitationLink(
  container: AwilixContainer,
  em: EntityManager,
  scope: ClubScope,
  subject: { personId: string; userId: string; createdByUserId: string },
  now: Date = new Date(),
): Promise<{ rawToken: string; expiresAt: Date }> {
  await em.nativeUpdate(
    InvitationLink,
    { ...scope, personId: subject.personId, revokedAt: null, deletedAt: null },
    { revokedAt: now, updatedAt: now },
  )
  const issued = await invitationLinkService(container).issue(em, subject, scope)
  return { rawToken: issued.rawToken, expiresAt: issued.link.expiresAt }
}

/** The live wards of a guardian on `today` with their participant groups (IL-D03). */
export async function wardGroupsOf(
  container: AwilixContainer,
  em: EntityManager,
  scope: ClubScope,
  guardianPersonId: string,
  today: CalendarDate,
): Promise<WardGroup[]> {
  const guardianships = await em.find(
    Guardianship,
    {
      ...scope,
      guardianPersonId,
      deletedAt: null,
      validFrom: { $lte: today },
      $or: [{ validTo: null }, { validTo: { $gte: today } }],
    },
    { fields: ['id', 'wardPersonId'] },
  )
  const wardIds = [...new Set(guardianships.map((row) => row.wardPersonId))]
  const contribution = membershipContribution(container)
  if (wardIds.length === 0 || !contribution) return []
  const groups = await contribution.participantGroups(em, scope, { personIds: wardIds }, today)
  return groups.map((row) => ({ groupId: row.groupId, sectionId: row.sectionId }))
}

/** A person is reachable while not deleted, not anonymized and not past their last day. */
export function personActive(
  person: Pick<Person, 'deletedAt' | 'anonymizedAt' | 'leftOn'> | null,
  today: CalendarDate,
): boolean {
  if (!person || person.deletedAt || person.anonymizedAt) return false
  return !person.leftOn || person.leftOn > today
}

export type InvitationLinkPage =
  | { state: 'valid'; club: { name: string } }
  | { state: 'invalid'; problem: InvitationLinkProblem; club: { name: string } | null }

type InspectedLink = {
  page: InvitationLinkPage
  link: InvitationLink | null
}

async function inspect(container: AwilixContainer, rawToken: string, now: Date): Promise<InspectedLink> {
  const em = container.resolve<EntityManager>('em').fork()
  const inspected = await invitationLinkService(container).inspect(em, rawToken)
  if (!inspected) {
    return { page: { state: 'invalid', problem: 'unknown', club: null }, link: null }
  }
  const { link } = inspected.view
  const scope = { tenantId: inspected.view.tenantId, organizationId: inspected.view.organizationId }
  const [club, today, person, account] = await Promise.all([
    clubOfScope(container, scope, em),
    clubToday(container, scope, now, em),
    em.findOne(Person, { id: link.personId, ...scope }, { fields: ['id', 'deletedAt', 'anonymizedAt', 'leftOn'] }),
    accountView(container, scope, link.userId, em),
  ])
  const problem = invitationLinkProblem({
    found: true,
    expired: inspected.state !== 'active',
    revoked: Boolean(link.revokedAt),
    personActive: personActive(person, today) && person?.id === link.personId,
    accountState: account.state,
  })
  const clubName = { name: club.name }
  return {
    page: problem ? { state: 'invalid', problem, club: clubName } : { state: 'valid', club: clubName },
    link,
  }
}

/**
 * What the guardian's page shows (REQ-IL03, REQ-IL04): the club and the next step for a valid link; for any other the
 * club when the link is known and nothing else. Never anything about the person. Spends nothing (a chat app's link
 * preview opens it harmlessly).
 */
export async function inspectInvitationLink(
  container: AwilixContainer,
  rawToken: string,
  now: Date = new Date(),
): Promise<InvitationLinkPage> {
  return (await inspect(container, rawToken, now)).page
}

/**
 * Starts the activation from a valid link (REQ-IL03): counts the use, and returns the platform's password-setup URL on
 * the club's address. Null for any invalid link (the route answers 410 with one code for every cause).
 */
export async function startInvitationLink(
  container: AwilixContainer,
  rawToken: string,
  now: Date = new Date(),
): Promise<{ url: string } | null> {
  const { page, link } = await inspect(container, rawToken, now)
  if (page.state !== 'valid' || !link) return null
  const scope = { tenantId: link.tenantId, organizationId: link.organizationId }
  const em = container.resolve<EntityManager>('em').fork()
  try {
    await invitationLinkService(container).redeem(em, rawToken, { scope })
  } catch {
    // Expired between the read and the update: as invalid as any other cause.
    return null
  }
  const { baseUrl } = await clubOfScope(container, scope, em)
  const setup = await passwordSetupLink(container, scope, link.userId, baseUrl)
  return { url: setup.url }
}

export type PendingFamily = {
  personId: string
  displayName: string
  invitedAt: string | null
  children: { firstName: string; groupName: string }[]
}

/**
 * The guardians with an invited account among the active guardians of the children in `rows` (participant groups
 * already narrowed to the caller's reach), with those children's first names and groups, by guardian name. Names
 * only: no address or phone (spec *Security*).
 */
export async function pendingFamilies(
  container: AwilixContainer,
  em: EntityManager,
  scope: ClubScope,
  rows: readonly ParticipantGroup[],
  today: CalendarDate,
): Promise<PendingFamily[]> {
  const wardIds = [...new Set(rows.map((row) => row.personId))]
  if (wardIds.length === 0) return []
  const guardianships = await em.find(
    Guardianship,
    {
      ...scope,
      wardPersonId: { $in: wardIds },
      deletedAt: null,
      validFrom: { $lte: today },
      $or: [{ validTo: null }, { validTo: { $gte: today } }],
    },
    { fields: ['id', 'guardianPersonId', 'wardPersonId'] },
  )
  const guardianIds = [...new Set(guardianships.map((row) => row.guardianPersonId))]
  if (guardianIds.length === 0) return []
  // Names are encrypted at rest (`encryption.ts`): read them decrypted, in memory only.
  const persons = await findWithDecryption(
    em,
    Person,
    { ...scope, id: { $in: [...new Set([...guardianIds, ...wardIds])] }, deletedAt: null },
    {},
    scope,
  )
  const byId = new Map(persons.map((person) => [person.id, person]))
  const families: PendingFamily[] = []
  for (const guardianId of guardianIds) {
    const guardian = byId.get(guardianId)
    if (!guardian?.userId || !personActive(guardian, today)) continue
    const account = await accountView(container, scope, guardian.userId, em)
    if (account.state !== 'invited') continue
    const wards = new Set(guardianships.filter((row) => row.guardianPersonId === guardianId).map((r) => r.wardPersonId))
    const children = rows
      .filter((row) => wards.has(row.personId) && personActive(byId.get(row.personId) ?? null, today))
      .map((row) => ({ firstName: byId.get(row.personId)?.firstName ?? '', groupName: row.groupName }))
      .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.groupName.localeCompare(b.groupName))
    if (children.length === 0) continue
    families.push({
      personId: guardian.id,
      displayName: `${guardian.firstName} ${guardian.lastName}`.trim(),
      invitedAt: account.invitedAt,
      children,
    })
  }
  return families.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

/**
 * `GET /api/people/invitations/pending` (REQ-IL02): the families with a pending invitation in the caller's reach —
 * every participant group of the reads `pendingListReads` names, kept by `groupInReach`, then their invited guardians.
 * Without `groups` no child is in a group, so the list is empty.
 */
export async function listPendingFamilies(
  container: AwilixContainer,
  scope: ClubScope,
  reach: ShareReach,
  requested: { groupId?: string | null; sectionId?: string | null },
  now: Date = new Date(),
): Promise<PendingFamily[]> {
  const contribution = membershipContribution(container)
  const reads = pendingListReads(reach, requested)
  if (!contribution || reads.length === 0) return []
  const em = container.resolve<EntityManager>('em').fork()
  const today = await clubToday(container, scope, now, em)
  const seen = new Set<string>()
  const rows: ParticipantGroup[] = []
  for (const filter of reads) {
    for (const row of await contribution.participantGroups(em, scope, filter, today)) {
      const key = `${row.personId}:${row.groupId}`
      if (seen.has(key) || !groupInReach(reach, row)) continue
      seen.add(key)
      rows.push(row)
    }
  }
  return pendingFamilies(container, em, scope, rows, today)
}
