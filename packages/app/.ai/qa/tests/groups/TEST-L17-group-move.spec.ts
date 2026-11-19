import { expect, test, type APIRequestContext } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { undoByToken } from '@open-mercato/core/helpers/integration/undoHarness'
import { safeDay } from '../_fixtures/activities'
import { declare, familyFor, readAttendanceList, rowOf, weeklySeries } from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub, type Club } from '../_fixtures/club'
import { createGroup, roster, type MembershipItem } from '../_fixtures/groups'
import { createFee, generate, listCharges, periodFromNow } from '../_fixtures/payments'
import { actionLogEntries } from '../_fixtures/people'

// People life-cycle spec phase L10 (#312; REQ-L11, DD-L15, Q-L17, AC-L12): TEST-L17 — a child in Żaki with a
// declaration for a later Żaki session and a generated monthly charge is moved to Skrzaty from today: the Żaki
// membership ends yesterday and a participant membership of Skrzaty starts today, in one step; the later Żaki
// declaration is dropped (the `activities` subscriber of the `groups.membership.updated` event), Skrzaty's session shows
// the child undeclared, generating the month again creates no Skrzaty charge for the child (one fee for the month),
// and the next month charges the Skrzaty fee only. The move refuses an overlapping membership in the target group
// (409 `membership_overlap`), a group outside the coordinator's sections on either side (403 `scope_denied`), a
// missing lock token (400) and the same group (422); its undo restores the old membership and removes the new one.
// TEST-L20 — the move route fails closed for a user without `groups.manage`.
test.describe.configure({ timeout: 420_000 })

type MoveBody = { ended?: MembershipItem; started?: MembershipItem; code?: string; error?: string }

function move(
  request: APIRequestContext,
  token: string,
  membership: Pick<MembershipItem, 'id' | 'updatedAt'>,
  toGroupId: string,
  date: string,
  lock = true,
) {
  return call<MoveBody>(request, 'POST', '/api/groups/memberships/move', token, {
    data: { membershipId: membership.id, toGroupId, date },
    headers: lock && membership.updatedAt ? { [OPTIMISTIC_LOCK_HEADER]: membership.updatedAt } : {},
  })
}

async function membershipOf(request: APIRequestContext, club: Club, groupId: string, personId: string) {
  const rows = await roster(request, club.adminToken, groupId, `&personId=${personId}`)
  expect(rows.status).toBe(200)
  const live = rows.items.filter((row) => row.validTo === null)
  expect(live, `one open membership of ${personId} in ${groupId}`).toHaveLength(1)
  return live[0]
}

async function liveDeclarations(club: Club, personId: string, occurrenceId: string): Promise<number> {
  return withClient(async (client) => {
    const rows = await client.query<{ count: string }>(
      `select count(*)::text as count from activities_attendances
        where tenant_id = $1 and person_id = $2 and occurrence_id = $3 and deleted_at is null`,
      [club.tenant.tenantId, personId, occurrenceId],
    )
    return Number(rows.rows[0]?.count ?? 0)
  })
}

async function membershipRow(club: Club, id: string) {
  return withClient(async (client) => {
    const rows = await client.query<{ valid_to: string | null; deleted: boolean }>(
      `select to_char(valid_to, 'YYYY-MM-DD') as valid_to, deleted_at is not null as deleted
         from groups_memberships where tenant_id = $1 and id = $2`,
      [club.tenant.tenantId, id],
    )
    return rows.rows[0] ?? null
  })
}

test('TEST-L17 a moved child loses the old declarations, shows undeclared in the new group and pays one fee', async ({
  request,
}) => {
  const club = await createClub(request, 'test-l17')
  try {
    const family = await familyFor(request, club)
    const admin = club.adminToken
    const today = calendarDate()
    const yesterday = calendarDate(-1)
    const period = periodFromNow(0)
    const nextPeriod = periodFromNow(1)
    const skrzaty = await createGroup(request, admin, { sectionId: family.academy, name: 'Skrzaty', kind: 'team' })
    const zakiFee = await createFee(request, admin, {
      name: 'Żaki',
      groupId: family.zaki,
      period: 'monthly',
      amount: 15000,
      dueDay: 10,
      validFrom: `${period}-01`,
    })
    const skrzatyFee = await createFee(request, admin, {
      name: 'Skrzaty',
      groupId: skrzaty,
      period: 'monthly',
      amount: 9000,
      dueDay: 10,
      validFrom: `${period}-01`,
    })

    // Later sessions of both groups; the guardian declares Kuba (the elder, Żaki only) for a Żaki session two or more
    // days ahead (lesson `integration-tests-pick-days-two-days-ahead`).
    const zakiTraining = await weeklySeries(request, club, family.academyCoordinator.token, {
      groupId: family.zaki,
      placeId: family.pitch,
      name: 'Trening Żaków L17',
      type: 'training',
      weekday: 'WE',
      start: '17:00',
      end: '18:00',
    })
    const skrzatyTraining = await weeklySeries(request, club, family.academyCoordinator.token, {
      groupId: skrzaty,
      placeId: family.pitch,
      name: 'Trening Skrzatów L17',
      type: 'training',
      weekday: 'TH',
      start: '17:00',
      end: '18:00',
    })
    const firstSafe = safeDay()
    const zakiLater = zakiTraining.sessions.find((session) => (session.occurrenceDate ?? '') >= firstSafe)
    const skrzatyLater = skrzatyTraining.sessions.find((session) => (session.occurrenceDate ?? '') >= firstSafe)
    expect(zakiLater && skrzatyLater, 'a later session of each group').toBeTruthy()
    const declared = await declare(request, family.guardian.token, {
      occurrenceId: String(zakiLater?.id),
      personId: family.elder.personId,
      declared: 'no',
    })
    expect([200, 201], JSON.stringify(declared.body)).toContain(declared.status)

    // The month's first generation charges Kuba the Żaki fee.
    const first = await generate(request, admin, period)
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    const kubaCharges = async (label: string) =>
      (await listCharges(request, admin, `&period=${label}`))
        .filter((charge) => charge.personId === family.elder.personId)
        .map((charge) => charge.sourceId)
    expect(await kubaCharges(period)).toEqual([zakiFee])

    // --- Refusals first: nothing changes ---
    const kubaZaki = await membershipOf(request, club, family.zaki, family.elder.personId)
    const noLock = await move(request, admin, kubaZaki, skrzaty, today, false)
    expect(noLock.status, JSON.stringify(noLock.body)).toBe(400)
    const sameGroup = await move(request, admin, kubaZaki, family.zaki, today)
    expect(sameGroup.status, JSON.stringify(sameGroup.body)).toBe(422)
    expect(sameGroup.body?.code).toBe('groups_reference_invalid')
    // Hania (the younger) is in Żaki already: moving her pool membership into Żaki overlaps (409).
    const haniaPool = await membershipOf(request, club, family.poolGroup, family.younger.personId)
    const overlap = await move(request, admin, haniaPool, family.zaki, today)
    expect(overlap.status, JSON.stringify(overlap.body)).toBe(409)
    expect(overlap.body?.code).toBe('membership_overlap')
    // The pool coordinator may not move out of Żaki (source outside the section) …
    const otherZaki = await membershipOf(request, club, family.zaki, family.other.child.personId)
    const foreignSource = await move(request, family.poolCoordinator.token, otherZaki, family.poolGroup, today)
    expect(foreignSource.status, JSON.stringify(foreignSource.body)).toBe(403)
    // … and the academy coordinator may not move into the pool group (target outside the section).
    const foreignTarget = await move(request, family.academyCoordinator.token, otherZaki, family.poolGroup, today)
    expect(foreignTarget.status, JSON.stringify(foreignTarget.body)).toBe(403)
    expect(foreignTarget.body?.code).toBe('scope_denied')
    // TEST-L20: a guardian has no `groups.manage`.
    const noFeature = await move(request, family.guardian.token, otherZaki, skrzaty, today)
    expect(noFeature.status).toBe(403)
    expect((await membershipRow(club, otherZaki.id))?.valid_to).toBeNull()

    // --- The move: Żaki ends yesterday, Skrzaty starts today, same role ---
    const moved = await move(request, family.academyCoordinator.token, kubaZaki, skrzaty, today)
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(moved.body?.ended).toMatchObject({ id: kubaZaki.id, groupId: family.zaki, validTo: yesterday })
    expect(moved.body?.started).toMatchObject({
      groupId: skrzaty,
      personId: family.elder.personId,
      role: 'participant',
      validFrom: today,
      validTo: null,
    })

    // Declarations: the later Żaki one is dropped; Skrzaty's session lists Kuba undeclared.
    await expect.poll(() => liveDeclarations(club, family.elder.personId, String(zakiLater?.id))).toBe(0)
    const skrzatyList = await readAttendanceList(request, admin, String(skrzatyLater?.id))
    expect(skrzatyList.status, JSON.stringify(skrzatyList.body)).toBe(200)
    const kubaRow = rowOf(skrzatyList.body ?? {}, family.elder.personId)
    expect(kubaRow.onRoster).toBe(true)
    expect(kubaRow.declared).toBeNull()

    // The fee: generating the month again creates no Skrzaty charge for Kuba; the next month charges Skrzaty only.
    const again = await generate(request, admin, period)
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(await kubaCharges(period)).toEqual([zakiFee])
    const next = await generate(request, admin, nextPeriod)
    expect(next.status, JSON.stringify(next.body)).toBe(200)
    expect(await kubaCharges(nextPeriod)).toEqual([skrzatyFee])

    // --- Undo of a move (the other child; the undo token is the actor's): both memberships come back as they were ---
    const otherMoved = await move(request, admin, otherZaki, skrzaty, today)
    expect(otherMoved.status, JSON.stringify(otherMoved.body)).toBe(200)
    const startedId = String(otherMoved.body?.started?.id)
    const log = (await actionLogEntries(request, admin, otherZaki.id)).find(
      (entry) => entry.commandId === 'groups.memberships.move',
    )
    expect(log?.undoToken).toBeTruthy()
    const undone = await undoByToken(request, admin, String(log?.undoToken))
    expect(undone.status(), await undone.text()).toBe(200)
    expect(await membershipRow(club, otherZaki.id)).toEqual({ valid_to: null, deleted: false })
    expect((await membershipRow(club, startedId))?.deleted).toBe(true)
  } finally {
    await club.cleanup()
  }
})
