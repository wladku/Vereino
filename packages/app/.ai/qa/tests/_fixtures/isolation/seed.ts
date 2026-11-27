// Two clubs with lookalike data for the cross-club isolation guard (#628, E22-S02; D-034). Club A is a fresh tenant
// set up like a real club; club B is a second organization of the SAME tenant, so a route that narrows by tenant only
// (and not by organization) is caught too. Both clubs get the same names, the same structure and one account per
// role; only the ids, e-mail addresses and public slugs differ. Every id a seed step learns goes into `refs` under a
// stable key the route inventory names (`$A:<key>`, `$B:<key>`).
import { expect, type APIRequestContext } from '@playwright/test'
import { getAuthToken } from '../auth'
import { createOrganizationFixture, createUserFixture } from '@open-mercato/core/helpers/integration/authFixtures'
import { memberAccount } from '../attendance'
import { create } from '../club-structure'
import { addMembership, createGroup, signedInStaff } from '../groups'
import {
  birthDateTurning,
  bootstrapAdmin,
  calendarDate,
  call,
  createClub,
  createPerson,
  uniqueSuffix,
  type ApiResult,
  type Club,
} from '../club'
import { createGuardianship } from '../people'

/** The roles of a club every read probe runs as; `anonymous` is a caller without a session. */
export const CLUB_ROLES = ['admin', 'coordinator', 'coach', 'treasurer', 'operator', 'member', 'guardian'] as const
export type ClubRole = (typeof CLUB_ROLES)[number]
export type ProbeRole = ClubRole | 'anonymous'

export type Refs = Record<string, string>

export type SeededClub = {
  label: 'A' | 'B'
  club: Club
  tokens: Record<ClubRole, string>
  refs: Refs
  /** Every response body a seed step recorded (its ids feed the other club's leak markers). */
  responses: unknown[]
  /** Unique strings of this club (e-mail addresses, slugs) that must never show up in the other club's answers. */
  markers: string[]
}

/** A seed step's API helper: calls the route, records the body and checks the status. */
export type SeedApi = <T = Record<string, unknown>>(
  method: string,
  url: string,
  options?: { token?: string; data?: unknown; headers?: Record<string, string>; status?: number | number[] },
) => Promise<ApiResult<T>>

export type SeedContext = {
  request: APIRequestContext
  seeded: SeededClub
  api: SeedApi
  /** The same club's base refs: shortcuts for the steps. */
  admin: string
}

export type ModuleSeed = (context: SeedContext) => Promise<void>

/** Club B: a second organization of club A's tenant with its own administrator, set up like a club. */
export async function createSecondClub(request: APIRequestContext, first: Club): Promise<Club> {
  const organizationId = await createOrganizationFixture(request, first.superToken, {
    name: `Vereino IT club ${uniqueSuffix()}`,
    tenantId: first.tenant.tenantId,
  })
  first.extraOrganizationIds.push(organizationId)
  const email = `admin-${uniqueSuffix()}@club-b.example.org`
  const password = `Vereino-${uniqueSuffix()}-Aa1!`
  const adminUserId = await createUserFixture(request, first.superToken, {
    email,
    password,
    organizationId,
    roles: [first.tenant.roleId],
  })
  first.extraUserIds.unshift(adminUserId)
  const boot = bootstrapAdmin({ tenantId: first.tenant.tenantId, organizationId }, adminUserId)
  return {
    ...first,
    tenant: { ...first.tenant, organizationId, userId: adminUserId, email, password },
    adminToken: await getAuthToken(request, email, password),
    adminUserId,
    adminPersonId: boot.personId,
    // The same arrays as club A: club A's cleanup removes club B's users and organization too.
    extraUserIds: first.extraUserIds,
    extraOrganizationIds: first.extraOrganizationIds,
    cleanup: () => Promise.resolve(),
  }
}

export async function createFirstClub(request: APIRequestContext): Promise<Club> {
  return createClub(request, 'issue-628-a')
}

function seedApi(request: APIRequestContext, seeded: SeededClub): SeedApi {
  return async (method, url, options = {}) => {
    const result = await call(request, method, url, options.token ?? seeded.tokens.admin, {
      data: options.data,
      headers: options.headers,
    })
    seeded.responses.push(result.body)
    const expected = options.status === undefined ? null : [options.status].flat()
    if (expected) {
      expect(
        expected,
        `club ${seeded.label}: ${method} ${url} → ${String(result.status)} ${JSON.stringify(result.body)}`,
      ).toContain(result.status)
    } else {
      expect(result.status, `club ${seeded.label}: ${method} ${url} ${JSON.stringify(result.body)}`).toBeLessThan(300)
    }
    return result as never
  }
}

/**
 * The base every module seed builds on: the football academy with one pitch, the teams Żaki and Orliki, one account
 * per role (the academy's coordinator, the coach of Żaki, treasurer, facility attendant of the pitch, an adult member of
 * Żaki and the guardian of a child in Żaki) and a person without an account.
 */
async function seedBase(request: APIRequestContext, club: Club, label: 'A' | 'B'): Promise<SeededClub> {
  const admin = club.adminToken
  const refs: Refs = {
    tenant: club.tenant.tenantId,
    organization: club.tenant.organizationId,
    adminPerson: club.adminPersonId,
    adminUser: club.adminUserId,
    today: calendarDate(),
    tomorrow: calendarDate(1),
    nextWeek: calendarDate(7),
    lastWeek: calendarDate(-7),
    period: calendarDate().slice(0, 7),
  }
  refs.section = await create(request, admin, 'sections', { name: 'Akademia piłkarska' })
  refs.place = await create(request, admin, 'places', { name: 'Boisko A', kind: 'pitch', capacityGroups: 2 })
  refs.institution = await create(request, admin, 'institutions', { name: 'KS Sąsiedzi', type: 'club' })
  refs.group = await createGroup(request, admin, { sectionId: refs.section, name: 'Żaki', kind: 'team' })
  refs.group2 = await createGroup(request, admin, { sectionId: refs.section, name: 'Orliki', kind: 'team' })
  const staff = async (firstName: string, lastName: string, role: Parameters<typeof signedInStaff>[2]['role']) =>
    signedInStaff(request, club, {
      firstName,
      lastName,
      role,
      ...(role === 'coordinator' ? { sectionId: refs.section } : {}),
      ...(role === 'facility_operator' ? { placeId: refs.place } : {}),
    })
  const coordinator = await staff('Krystyna', 'Koordynator', 'coordinator')
  const coach = await staff('Tomasz', 'Trener', 'coach')
  const treasurer = await staff('Halina', 'Skarbnik', 'treasurer')
  const operator = await staff('Olek', 'Gospodarz', 'facility_operator')
  refs.coordinatorPerson = coordinator.personId
  refs.coachPerson = coach.personId
  refs.treasurerPerson = treasurer.personId
  refs.operatorPerson = operator.personId
  refs.coachUser = coach.userId
  // The staff second factor reset (#736) addresses a user who holds the requirement.
  refs.treasurerUser = treasurer.userId
  const since = calendarDate(-30)
  refs.coachMembership = await addMembership(request, admin, {
    groupId: refs.group,
    personId: refs.coachPerson,
    role: 'coach',
    validFrom: since,
  })
  refs.memberPerson = await createPerson(request, admin, {
    firstName: 'Iga',
    lastName: 'Dorosła',
    birthDate: birthDateTurning(19),
  })
  refs.membership = await addMembership(request, admin, {
    groupId: refs.group,
    personId: refs.memberPerson,
    role: 'participant',
    validFrom: since,
  })
  refs.childPerson = await createPerson(request, admin, {
    firstName: 'Kuba',
    lastName: 'Młody',
    birthDate: birthDateTurning(9),
  })
  refs.childMembership = await addMembership(request, admin, {
    groupId: refs.group,
    personId: refs.childPerson,
    role: 'participant',
    validFrom: since,
  })
  refs.guardianPerson = await createPerson(request, admin, {
    firstName: 'Ewa',
    lastName: 'Rodzic',
    birthDate: birthDateTurning(40),
  })
  refs.guardianship = await createGuardianship(request, admin, {
    guardianPersonId: refs.guardianPerson,
    wardPersonId: refs.childPerson,
    relation: 'parent',
    isPrimaryPayer: true,
    validFrom: since,
  })
  refs.plainPerson = await createPerson(request, admin, {
    firstName: 'Piotr',
    lastName: 'Bezkonta',
    birthDate: birthDateTurning(30),
  })
  const domain = label === 'B' ? 'club-b' : 'club-a'
  const member = await memberAccount(request, club, refs.memberPerson, `member-${domain}`)
  const guardian = await memberAccount(request, club, refs.guardianPerson, `guardian-${domain}`)
  refs.memberUser = member.userId
  refs.guardianUser = guardian.userId
  return {
    label,
    club,
    refs,
    responses: [],
    markers: [
      club.tenant.email,
      coordinator.email,
      coach.email,
      treasurer.email,
      operator.email,
      member.email,
      guardian.email,
    ],
    tokens: {
      admin,
      coordinator: coordinator.token,
      coach: coach.token,
      treasurer: treasurer.token,
      operator: operator.token,
      member: member.token,
      guardian: guardian.token,
    },
  }
}

/** Seeds a club: the base, then each module seed in order. */
export async function seedClub(
  request: APIRequestContext,
  club: Club,
  label: 'A' | 'B',
  moduleSeeds: readonly ModuleSeed[],
): Promise<SeededClub> {
  const seeded = await seedBase(request, club, label)
  const context: SeedContext = { request, seeded, api: seedApi(request, seeded), admin: seeded.tokens.admin }
  for (const moduleSeed of moduleSeeds) await moduleSeed(context)
  return seeded
}
