import { expect, test, type APIRequestContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { addDays } from '../_fixtures/activities'
import { declare, familyFor, firstSession, weeklySeries } from '../_fixtures/attendance'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
} from '../_fixtures/club'
import { addMembership, endMembership, type MembershipItem } from '../_fixtures/groups'
import { actionLogEntries } from '../_fixtures/people'

// TEST-A03 (groups and activities parity spec REQ-A03, AC-A03; issue #267): a roster of 130 seeded memberships plus the
// family fixture's Żaki is fully reachable page by page in each view (`status=active|upcoming|ended`,
// `sortField=roster`) and each view's total equals the data; the roster order lists coaches first; ending an upcoming
// membership answers 422 `membership_not_started`, ending on a chosen day saves `valid_to` and an end into an overlap
// answers 409 `membership_overlap`, as does an edit into an overlap; Remove succeeds for an upcoming and an unused
// membership and answers 409 `membership_in_use` for one with attendance; an undo restores a removed row.
test.describe.configure({ timeout: 300_000 })

type Page = { items?: MembershipItem[]; total?: number; totalPages?: number }

async function readPage(request: APIRequestContext, token: string, query: string): Promise<Page> {
  const result = await call<Page>(request, 'GET', `/api/groups/memberships?${query}`, token)
  expect(result.status, `GET /api/groups/memberships?${query} ${JSON.stringify(result.body)}`).toBe(200)
  return result.body ?? {}
}

/** Every row of a view, page by page in the roster order, and the reported total. */
async function wholeView(request: APIRequestContext, token: string, groupId: string, status: string) {
  const rows: MembershipItem[] = []
  let page = 1
  let total = 0
  let totalPages = 1
  do {
    const body = await readPage(
      request,
      token,
      `groupId=${groupId}&status=${status}&sortField=roster&page=${String(page)}&pageSize=50`,
    )
    rows.push(...(body.items ?? []))
    total = body.total ?? 0
    totalPages = body.totalPages ?? 0
    page += 1
  } while (page <= totalPages)
  return { rows, total }
}

const ROLE_RANK: Record<string, number> = { coach: 0, assistant: 1, participant: 2 }

async function removeMembership(request: APIRequestContext, token: string, id: string, lockToken: string | null) {
  return call<{ ok?: boolean; code?: string }>(request, 'DELETE', `/api/groups/memberships?id=${id}`, token, {
    headers: lockToken ? { [OPTIMISTIC_LOCK_HEADER]: lockToken } : {},
  })
}

async function membershipOf(request: APIRequestContext, token: string, groupId: string, id: string) {
  const body = await readPage(request, token, `groupId=${groupId}&ids=${id}`)
  return body.items?.find((item) => item.id === id) ?? null
}

test('TEST-A03 a roster of 130 memberships is fully reachable per view; end, edit, remove with their coded refusals; undo restores a removed row', async ({
  request,
}) => {
  const club = await createClub(request, 'test-a03-roster')
  try {
    const family = await familyFor(request, club)
    const token = club.adminToken
    const group = family.zaki
    const today = calendarDate()

    // 130 seeded memberships of persons outside `people` (the list then carries no person): 50 active, 40 upcoming,
    // 40 ended.
    const seeded = { active: 50, upcoming: 40, ended: 40 }
    await withClient(async (client) => {
      const insert = async (count: number, validFrom: string, validTo: string | null) => {
        for (let index = 0; index < count; index += 1) {
          await client.query(
            `insert into groups_memberships
               (id, tenant_id, organization_id, group_id, person_id, role, valid_from, valid_to, created_at, updated_at)
             values ($1, $2, $3, $4, $5, 'participant', $6, $7, now(), now())`,
            [randomUUID(), club.tenant.tenantId, club.tenant.organizationId, group, randomUUID(), validFrom, validTo],
          )
        }
      }
      await insert(seeded.active, addDays(today, -30), null)
      await insert(seeded.upcoming, addDays(today, 10), null)
      await insert(seeded.ended, addDays(today, -100), addDays(today, -40))
    })

    // Each view: every row reachable exactly once, the total equals the rows, and the CRUD list agrees.
    const totals: Record<string, number> = {}
    for (const status of ['active', 'upcoming', 'ended']) {
      const { rows, total } = await wholeView(request, token, group, status)
      expect(new Set(rows.map((row) => row.id)).size, status).toBe(rows.length)
      expect(rows.length, status).toBe(total)
      expect(total, status).toBeGreaterThanOrEqual(seeded[status as keyof typeof seeded])
      const plain = await readPage(request, token, `groupId=${group}&status=${status}&pageSize=1`)
      expect(plain.total, `CRUD total of ${status}`).toBe(total)
      totals[status] = total
      // Coaches first, then assistants, then participants; within a role the latest start first.
      for (let index = 1; index < rows.length; index += 1) {
        const previous = rows[index - 1]
        const current = rows[index]
        const order = ROLE_RANK[String(previous.role)] - ROLE_RANK[String(current.role)]
        expect(order, `${status} role order at ${String(index)}`).toBeLessThanOrEqual(0)
        if (order === 0) expect(String(previous.validFrom) >= String(current.validFrom)).toBe(true)
      }
    }
    expect(totals.active + totals.upcoming + totals.ended).toBe(
      (await readPage(request, token, `groupId=${group}&pageSize=1`)).total,
    )
    const activeFirst = (await readPage(request, token, `groupId=${group}&status=active&sortField=roster&pageSize=1`))
      .items?.[0]
    expect(activeFirst?.role).toBe('coach')

    // End: an upcoming membership → 422 `membership_not_started`; a chosen last day before the first → the same 422; a
    // chosen last day is saved.
    const ola = await createPerson(request, token, {
      firstName: 'Ola',
      lastName: 'Lis',
      birthDate: birthDateTurning(9),
    })
    const upcoming = await addMembership(request, token, {
      groupId: group,
      personId: ola,
      role: 'participant',
      validFrom: addDays(today, 10),
    })
    const upcomingRow = await membershipOf(request, token, group, upcoming)
    const notStarted = await endMembership(request, token, upcoming, upcomingRow?.updatedAt, addDays(today, 12))
    expect(notStarted.status, JSON.stringify(notStarted.body)).toBe(422)
    expect(notStarted.body?.code).toBe('membership_not_started')

    const kasia = await createPerson(request, token, {
      firstName: 'Kasia',
      lastName: 'Bór',
      birthDate: birthDateTurning(10),
    })
    const unused = await addMembership(request, token, {
      groupId: group,
      personId: kasia,
      role: 'participant',
      validFrom: addDays(today, -30),
    })
    let unusedRow = await membershipOf(request, token, group, unused)
    const beforeStart = await endMembership(request, token, unused, unusedRow?.updatedAt, addDays(today, -31))
    expect(beforeStart.status).toBe(422)
    expect(beforeStart.body?.code).toBe('membership_not_started')
    const ended = await endMembership(request, token, unused, unusedRow?.updatedAt, addDays(today, 13))
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    unusedRow = await membershipOf(request, token, group, unused)
    expect(unusedRow?.validTo).toBe(addDays(today, 13))
    // A chosen last day past a later membership of the same person and role → 409 `membership_overlap`, unchanged.
    const rejoined = await addMembership(request, token, {
      groupId: group,
      personId: kasia,
      role: 'participant',
      validFrom: addDays(today, 20),
    })
    const overlapEnd = await endMembership(request, token, unused, unusedRow?.updatedAt, addDays(today, 25))
    expect(overlapEnd.status, JSON.stringify(overlapEnd.body)).toBe(409)
    expect(overlapEnd.body?.code).toBe('membership_overlap')
    expect((await membershipOf(request, token, group, unused))?.validTo).toBe(addDays(today, 13))
    const rejoinedRow = await membershipOf(request, token, group, rejoined)
    expect((await removeMembership(request, token, rejoined, rejoinedRow?.updatedAt ?? null)).status).toBe(200)

    // Edit: the role and dates change; an edit into an overlap answers 409 `membership_overlap`.
    const edited = await call<{ updatedAt?: string; code?: string }>(request, 'PUT', '/api/groups/memberships', token, {
      data: { id: upcoming, validFrom: addDays(today, 10), validTo: addDays(today, 20) },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(upcomingRow?.updatedAt) },
    })
    expect(edited.status, JSON.stringify(edited.body)).toBe(200)
    const later = await addMembership(request, token, {
      groupId: group,
      personId: ola,
      role: 'participant',
      validFrom: addDays(today, 40),
    })
    const overlap = await call<{ code?: string }>(request, 'PUT', '/api/groups/memberships', token, {
      data: { id: upcoming, validTo: null },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(edited.body?.updatedAt) },
    })
    expect(overlap.status, JSON.stringify(overlap.body)).toBe(409)
    expect(overlap.body?.code).toBe('membership_overlap')

    // Remove: without the version → 400; an upcoming one and a started unused one are removed.
    const laterRow = await membershipOf(request, token, group, later)
    expect((await removeMembership(request, token, later, null)).status).toBe(400)
    const removedUpcoming = await removeMembership(request, token, later, laterRow?.updatedAt ?? null)
    expect(removedUpcoming.status, JSON.stringify(removedUpcoming.body)).toBe(200)
    expect(await membershipOf(request, token, group, later)).toBeNull()
    const removedUnused = await removeMembership(request, token, unused, unusedRow?.updatedAt ?? null)
    expect(removedUnused.status, JSON.stringify(removedUnused.body)).toBe(200)
    expect(await membershipOf(request, token, group, unused)).toBeNull()

    // A membership with attendance: the guardian reported an absence for a session in its period → 409.
    const training = await weeklySeries(request, club, family.academyCoordinator.token, {
      groupId: group,
      placeId: family.pitch,
      name: 'Trening Żaków',
      type: 'training',
      weekday: 'TU',
      start: '17:00',
      end: '18:30',
    })
    const session = firstSession(training.sessions)
    const reported = await declare(request, family.guardian.token, {
      occurrenceId: session.id,
      personId: family.younger.personId,
      declared: 'no',
    })
    expect(reported.status, JSON.stringify(reported.body)).toBe(201)
    const used = (await readPage(request, token, `groupId=${group}&personId=${family.younger.personId}`)).items?.[0]
    expect(used).toBeTruthy()
    const inUse = await removeMembership(request, token, String(used?.id), used?.updatedAt ?? null)
    expect(inUse.status, JSON.stringify(inUse.body)).toBe(409)
    expect(inUse.body?.code).toBe('membership_in_use')
    expect(await membershipOf(request, token, group, String(used?.id))).not.toBeNull()

    // Undo of a remove restores the row with its period.
    const removeLog = (await actionLogEntries(request, token, unused)).find(
      (entry) => entry.commandId === 'groups.memberships.delete',
    )
    expect(removeLog?.undoToken).toBeTruthy()
    const undone = await undoByToken(request, token, String(removeLog?.undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    const restored = await membershipOf(request, token, group, unused)
    expect(restored).toMatchObject({ id: unused, personId: kasia, validTo: addDays(today, 13) })
  } finally {
    await club.cleanup()
  }
})
