import { expect, test, type APIRequestContext } from '@playwright/test'
import {
  assignRole,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  type Club,
} from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { outputOf, runProbe } from '../_fixtures/messaging'
import { createGuardianship, persons, type PersonItem } from '../_fixtures/people'

// UX parity spec REQ-U01 (E06-S01 #83): the people list's perspectives, filters and columns.
// TEST-U01 — every perspective and filter, their combinations, and the columns roles / hasWards / guardians / _groups.
// TEST-U02 — a coordinator sees the same rows with basic fields only; another tenant's ids return nothing.
test.describe.configure({ timeout: 300_000 })

type Row = PersonItem & {
  age?: number | null
  roles?: string[]
  hasWards?: boolean
  guardians?: { id: string; displayName: string }[]
  _groups?: { groups: { id: string; name: string; role: string }[] }
}

async function ids(request: APIRequestContext, token: string, query: string): Promise<string[]> {
  const result = await persons(request, token, query)
  expect(result.status, `GET persons ${query} ${result.raw}`).toBe(200)
  const list = result.items.map((item) => item.id)
  expect(new Set(list).size, 'a person is listed once').toBe(list.length)
  return list.sort()
}

function sorted(...values: string[]): string[] {
  return [...values].sort()
}

type Fixture = {
  club: Club
  basen: string
  zaki: string
  basenGroup: string
  jan: string
  ola: string
  kasia: string
  coachByRole: string
  coachByMembership: string
  coordinator: { personId: string; token: string }
}

async function seed(request: APIRequestContext, label: string): Promise<Fixture> {
  const club = await createClub(request, label)
  const token = club.adminToken
  const academy = await createStructure(request, token, 'sections', { name: 'Akademia' })
  const basen = await createStructure(request, token, 'sections', { name: 'Basen' })
  const zaki = await createGroup(request, token, { sectionId: academy, name: 'Żaki', kind: 'team' })
  const basenGroup = await createGroup(request, token, { sectionId: basen, name: 'Basen — początkujący', kind: 'team' })
  const jan = await createPerson(request, token, {
    firstName: 'Jan',
    lastName: 'Kowalski',
    birthDate: birthDateTurning(9),
  })
  const ola = await createPerson(request, token, {
    firstName: 'Ola',
    lastName: 'Kowalska',
    birthDate: birthDateTurning(12),
  })
  const kasia = await createPerson(request, token, {
    firstName: 'Kasia',
    lastName: 'Kowalska',
    birthDate: birthDateTurning(38),
  })
  const coachByRole = await createPerson(request, token, {
    firstName: 'Wojtek',
    lastName: 'Nowak',
    birthDate: birthDateTurning(41),
  })
  const coachByMembership = await createPerson(request, token, {
    firstName: 'Piotr',
    lastName: 'Zieliński',
    birthDate: birthDateTurning(30),
  })
  const since = '2020-01-01'
  await addMembership(request, token, { groupId: basenGroup, personId: jan, role: 'participant', validFrom: since })
  await addMembership(request, token, { groupId: zaki, personId: ola, role: 'participant', validFrom: since })
  await addMembership(request, token, { groupId: zaki, personId: coachByMembership, role: 'coach', validFrom: since })
  await assignRole(request, token, { personId: coachByRole, role: 'coach', validFrom: since })
  for (const ward of [jan, ola]) {
    await createGuardianship(request, token, { guardianPersonId: kasia, wardPersonId: ward, validFrom: calendarDate() })
  }
  const coordinator = await signedInStaff(request, club, {
    firstName: 'Ewa',
    lastName: 'Basenowa',
    role: 'coordinator',
    sectionId: basen,
  })
  return { club, basen, zaki, basenGroup, jan, ola, kasia, coachByRole, coachByMembership, coordinator }
}

test('TEST-U01 the people list filters by perspective, section, group, role, account, age and name, with its columns', async ({
  request,
}) => {
  const f = await seed(request, 'e06-s01-filters')
  try {
    const token = f.club.adminToken
    const admin = f.club.adminPersonId

    // Section: an active membership in one of its groups, or a role scoped to it.
    expect(await ids(request, token, `&sectionId=${f.basen}`)).toEqual(sorted(f.jan, f.coordinator.personId))
    expect(await ids(request, token, `&groupId=${f.zaki}`)).toEqual(sorted(f.ola, f.coachByMembership))

    // Perspectives.
    expect(await ids(request, token, '&view=children')).toEqual(sorted(f.jan, f.ola))
    expect(await ids(request, token, `&view=children&sectionId=${f.basen}`)).toEqual([f.jan])
    expect(await ids(request, token, '&view=staff')).toEqual(
      sorted(admin, f.coachByRole, f.coachByMembership, f.coordinator.personId),
    )
    expect(await ids(request, token, '&view=no_account')).toEqual(
      sorted(f.jan, f.ola, f.kasia, f.coachByRole, f.coachByMembership),
    )
    expect(await ids(request, token, '&view=no_account&hasAccount=true')).toEqual([])
    expect(await ids(request, token, '&hasAccount=true')).toEqual(sorted(admin, f.coordinator.personId))

    // Roles.
    expect(await ids(request, token, '&role=coach')).toEqual(sorted(f.coachByRole, f.coachByMembership))
    expect(await ids(request, token, '&role=guardian')).toEqual([f.kasia])
    expect(await ids(request, token, '&role=participant')).toEqual(sorted(f.jan, f.ola))
    expect(await ids(request, token, '&role=coordinator')).toEqual([f.coordinator.personId])
    expect(await ids(request, token, '&role=club_admin')).toEqual([admin])

    // Age range (inclusive) and its validation.
    expect(await ids(request, token, '&ageFrom=13&ageTo=40')).toEqual(
      sorted(f.kasia, f.coachByMembership, f.coordinator.personId),
    )
    expect(await ids(request, token, '&ageFrom=9&ageTo=9')).toEqual([f.jan])
    const inverted = await call(request, 'GET', '/api/people/persons?ageFrom=20&ageTo=10', token)
    expect(inverted.status).toBe(400)
    expect(inverted.body?.code).toBe('people_filter_age_range')
    const outOfRange = await call(request, 'GET', '/api/people/persons?ageTo=121', token)
    expect(outOfRange.status).toBe(400)

    // Columns.
    const listed = await persons(request, token, '')
    const rows = new Map((listed.items as Row[]).map((row) => [row.id, row]))
    expect(rows.get(f.kasia)?.hasWards).toBe(true)
    expect(rows.get(f.kasia)?.roles).toEqual([])
    expect(rows.get(f.jan)?.guardians).toEqual([{ id: f.kasia, displayName: 'Kowalska Kasia' }])
    expect(rows.get(f.ola)?.guardians?.map((guardian) => guardian.id)).toEqual([f.kasia])
    expect(rows.get(f.jan)?.hasWards).toBe(false)
    expect(rows.get(f.jan)?.age).toBe(9)
    expect(rows.get(f.coachByRole)?.roles).toEqual(['coach'])
    expect(rows.get(f.coordinator.personId)?.roles).toEqual(['coordinator'])
    expect(rows.get(f.coachByMembership)?._groups?.groups).toEqual([{ id: f.zaki, name: 'Żaki', role: 'coach' }])
    expect(rows.get(f.jan)?._groups?.groups).toEqual([
      { id: f.basenGroup, name: 'Basen — początkujący', role: 'participant' },
    ])
    expect(rows.get(f.kasia)?._groups?.groups).toEqual([])

    // Name search over the first and the last name (search tokens are written after the commit).
    await expect.poll(() => ids(request, token, '&search=Jan%20Kow'), { timeout: 30_000 }).toEqual([f.jan])
    await expect
      .poll(() => ids(request, token, '&search=Kowalsk'), { timeout: 30_000 })
      .toEqual(sorted(f.jan, f.ola, f.kasia))
    expect(await ids(request, token, '&search=Kasia&view=children')).toEqual([])
  } finally {
    await f.club.cleanup()
  }
})

test('TEST-U03 without groups.personFilter a group-based filter answers 400 and the plain list still works', async ({
  request,
}) => {
  const f = await seed(request, 'e06-s01-no-groups')
  try {
    const scope = { tenantId: f.club.tenant.tenantId, organizationId: f.club.tenant.organizationId }
    const get = (url: string) => ({
      op: 'routeGet',
      source: 'modules/people/api/persons/route.ts',
      url,
      token: f.club.adminToken,
    })
    const run = runProbe(scope, [
      // With the contract registered (the baseline the hidden run is compared against).
      get(`/api/people/persons?pageSize=100&sectionId=${f.basen}`),
      { op: 'hideProviders', tokens: ['groups.personFilter'] },
      get(`/api/people/persons?pageSize=100&sectionId=${f.basen}`),
      get(`/api/people/persons?pageSize=100&groupId=${f.zaki}`),
      get('/api/people/persons?pageSize=100&role=participant'),
      get('/api/people/persons?pageSize=100'),
      // Staff and coach drop the membership part: the role assignments alone.
      get('/api/people/persons?pageSize=100&role=coach'),
      get('/api/people/persons?pageSize=100&view=children'),
    ])
    expect(run.result.failure, run.log).toBeNull()
    type Out = { status: number; code: string | null; ids: string[] | null }
    const out = (index: number) => outputOf(run, index) as Out
    expect(out(0).status, run.log).toBe(200)
    expect(out(0).ids?.sort()).toEqual(sorted(f.jan, f.coordinator.personId))
    for (const index of [2, 3, 4]) {
      expect(out(index).status).toBe(400)
      expect(out(index).code).toBe('people_filter_unavailable')
    }
    expect(out(5).status).toBe(200)
    expect(out(5).ids).toHaveLength(7)
    expect(out(6).ids).toEqual([f.coachByRole])
    expect(out(7).ids?.sort()).toEqual(sorted(f.jan, f.ola))
  } finally {
    await f.club.cleanup()
  }
})

test('TEST-U02 a coordinator filters with basic fields only, and another club ids match nobody', async ({
  request,
}) => {
  const f = await seed(request, 'e06-s01-security')
  const other = await createClub(request, 'e06-s01-other')
  try {
    const otherSection = await createStructure(request, other.adminToken, 'sections', { name: 'Basen' })
    const otherGroup = await createGroup(request, other.adminToken, {
      sectionId: otherSection,
      name: 'Basen — początkujący',
      kind: 'team',
    })

    const token = f.coordinator.token
    expect(await ids(request, token, `&sectionId=${f.basen}`)).toEqual(sorted(f.jan, f.coordinator.personId))
    expect(await ids(request, token, '&view=children')).toEqual(sorted(f.jan, f.ola))
    expect(await ids(request, token, '&role=guardian')).toEqual([f.kasia])
    for (const query of ['', '&view=staff', '&role=coach', `&groupId=${f.zaki}`, '&ageFrom=0&ageTo=120']) {
      const result = await persons(request, token, query)
      expect(result.status).toBe(200)
      for (const row of result.items) {
        for (const key of ['email', 'phone', 'pesel', 'notes', 'externalId']) expect(row).not.toHaveProperty(key)
      }
      expect(result.raw).not.toMatch(/@example\.org/)
    }

    // Enumeration: another club's section or group is an empty list, not an error, for both callers.
    for (const caller of [f.club.adminToken, token]) {
      expect(await ids(request, caller, `&sectionId=${otherSection}`)).toEqual([])
      expect(await ids(request, caller, `&groupId=${otherGroup}`)).toEqual([])
    }
    // And the other club's administrator never sees this club's people through any filter.
    const theirs = await ids(request, other.adminToken, '&view=all')
    expect(theirs).toEqual([other.adminPersonId])
    expect(await ids(request, other.adminToken, `&sectionId=${f.basen}`)).toEqual([])
  } finally {
    await other.cleanup()
    await f.club.cleanup()
  }
})
