import { expect, test, type APIRequestContext } from '@playwright/test'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub, createPerson, uniqueSuffix } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import {
  acceptApplication,
  applicationIn,
  applicationStatus,
  childApplication,
  confirmedApplication,
  createGroup,
  decideApplication,
  listApplications,
  notificationRows,
  openApplications,
  publicApplicationsApi,
  runEnrolmentJob,
} from '../_fixtures/enrolment'
import { publicCall } from '../_fixtures/declaration-links'
import { addMembership, createSeason, endMembership, roster } from '../_fixtures/groups'

// TEST-J09 (section sign-up form spec phase 3, E26-S04 #800; REQ-J15, DD-J09, DD-J10a, DD-J15, DD-J15a, AC-J09):
// - a full group's waiting list is numbered by entry: three confirmed applications are 1–3, an application moved to the
//   list later is appended as 4, and after number 1 withdraws the others are 1–3 (never higher than e-mailed);
// - a place that frees up is announced to the deciders once per group and day, without the applicant's name in the
//   stored notice; an end date in the future frees nothing yet (the daily job announces it on that day);
// - two concurrent accepts into the last place: one wins, the other answers 409 `group_full`; accepting beyond the
//   limit needs `overLimit`;
// - a season rollover that closes a group moves its open applications back to New with the flag "group closed".
test.describe.configure({ timeout: 420_000 })

const DAY = 24 * 60 * 60 * 1000

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
}

function names(items: { participantName: string; waitingNumber: number | null }[]) {
  return items.map((item) => [item.participantName, item.waitingNumber])
}

async function waitingOf(request: APIRequestContext, token: string, groupId: string) {
  const list = await listApplications(request, token, { tab: 'waiting', groupId })
  expect(list.status, JSON.stringify(list.body)).toBe(200)
  return list.body?.items ?? []
}

test('TEST-J09 waiting numbers, freed places, the last place and a closed group', async ({ request }) => {
  const club = await createClub(request, 'test-j09-places')
  try {
    const admin = club.adminToken
    const tag = uniqueSuffix()
    const clubSlug = `j09-${tag}`
    const sectionSlug = `pilka-${tag}`
    const today = calendarDate()
    const section = await createStructure(request, admin, 'sections', { name: 'Piłka nożna J09' })
    const zaki = await createGroup(request, admin, {
      sectionId: section,
      name: 'Żaki',
      kind: 'class_group',
      ageFrom: 7,
      ageTo: 9,
      placesLimit: 2,
    })
    const season = await createSeason(request, admin, {
      name: `Sezon J09 ${tag}`,
      startsOn: addDays(today, -200),
      endsOn: addDays(today, 30),
    })
    const orliki = await createGroup(request, admin, {
      sectionId: section,
      name: 'Orliki',
      kind: 'team',
      seasonId: season,
      placesLimit: 1,
    })
    await openApplications(request, club, { clubSlug, sectionId: section, sectionSlug, groupIds: [zaki, orliki] })
    const first = await createPerson(request, admin, { firstName: 'Adam', lastName: 'Pełny', birthDate: '2017-01-01' })
    const second = await createPerson(request, admin, {
      firstName: 'Bartek',
      lastName: 'Pełny',
      birthDate: '2017-02-01',
    })
    const firstMembership = await addMembership(request, admin, {
      groupId: zaki,
      personId: first,
      role: 'participant',
      validFrom: addDays(today, -10),
    })
    const secondMembership = await addMembership(request, admin, {
      groupId: zaki,
      personId: second,
      role: 'participant',
      validFrom: addDays(today, -10),
    })

    // --- Numbers 1–3 on confirmation, a later move appended as 4, renumbered after a withdrawal ---
    const tokens: string[] = []
    for (const [index, child] of ['Ala', 'Basia', 'Celina'].entries()) {
      const email = `w${String(index)}-${tag}@example.test`
      const { statusToken, confirmed } = await confirmedApplication(
        clubSlug,
        sectionSlug,
        childApplication(email, { participantFirstName: child, groupId: zaki, chooseForUs: false }),
      )
      expect(confirmed.body).toMatchObject({ state: 'waiting', waitingNumber: index + 1 })
      tokens.push(statusToken)
    }
    await confirmedApplication(
      clubSlug,
      sectionSlug,
      childApplication(`w3-${tag}@example.test`, { participantFirstName: 'Dorota' }),
    )
    const dorota = await applicationIn(request, admin, 'new', 'Dorota Nowak')
    const moved = await decideApplication(request, admin, String(dorota?.id), 'waiting', {
      groupId: zaki,
      updatedAt: dorota?.updatedAt,
    })
    expect(moved.body).toMatchObject({ waitingNumber: 4 })
    expect(names(await waitingOf(request, admin, zaki))).toEqual([
      ['Ala Nowak', 1],
      ['Basia Nowak', 2],
      ['Celina Nowak', 3],
      ['Dorota Nowak', 4],
    ])
    const withdrawn = await publicCall('POST', publicApplicationsApi(clubSlug, 'withdraw'), { token: tokens[0] })
    expect(withdrawn.status, withdrawn.text).toBe(200)
    expect(names(await waitingOf(request, admin, zaki))).toEqual([
      ['Basia Nowak', 1],
      ['Celina Nowak', 2],
      ['Dorota Nowak', 3],
    ])
    expect((await applicationStatus(clubSlug, tokens[1])).body).toMatchObject({ state: 'waiting', waitingNumber: 1 })

    // --- Freed places: an end date tomorrow frees nothing today; the daily job announces it, once a day ---
    const lock = (await roster(request, admin, zaki)).items.find((item) => item.id === firstMembership)?.updatedAt
    const ended = await endMembership(request, admin, firstMembership, lock, today)
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    expect(await notificationRows(club, 'enrolment.place_freed')).toEqual([])
    const tomorrow = `${addDays(today, 1)}T08:00:00+01:00`
    expect(runEnrolmentJob(club, 'daily', tomorrow).placesFreed).toBe(1)
    expect(runEnrolmentJob(club, 'daily', tomorrow).placesFreed).toBe(1)
    const notices = await notificationRows(club, 'enrolment.place_freed')
    expect(new Set(notices.map((notice) => notice.group_key))).toEqual(
      new Set([`enrolment:place_freed:${zaki}:${addDays(today, 1)}`]),
    )
    for (const notice of notices) expect(notice.body).not.toContain('Basia')

    // --- The last place: two concurrent accepts, one wins; beyond the limit only with the flag ---
    const secondLock = (await roster(request, admin, zaki)).items.find((item) => item.id === secondMembership)
    const removed = await call(request, 'DELETE', `/api/groups/memberships?id=${secondMembership}`, admin, {
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(secondLock?.updatedAt) },
    })
    expect(removed.status, JSON.stringify(removed.body)).toBeLessThan(300)
    // The deletion frees a place today: the subscriber announces it.
    await expect
      .poll(async () => (await notificationRows(club, 'enrolment.place_freed')).map((notice) => notice.group_key))
      .toContain(`enrolment:place_freed:${zaki}:${today}`)
    // Today Adam (ending today) still holds one of the two places: one place is left.
    const waiting = await waitingOf(request, admin, zaki)
    const startDay = today
    const [one, two] = await Promise.all(
      waiting.slice(0, 2).map((item) =>
        acceptApplication(request, admin, item.id, {
          groupId: zaki,
          startDay,
          sendInvitation: false,
          updatedAt: item.updatedAt,
        }),
      ),
    )
    expect([one.status, two.status].sort()).toEqual([200, 409])
    expect([one.body?.code, two.body?.code]).toContain('group_full')
    const third = (await waitingOf(request, admin, zaki)).at(-1)
    const refused = await acceptApplication(request, admin, String(third?.id), {
      groupId: zaki,
      startDay,
      sendInvitation: false,
      updatedAt: third?.updatedAt,
    })
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body?.code).toBe('group_full')
    const beyond = await acceptApplication(request, admin, String(third?.id), {
      groupId: zaki,
      startDay,
      overLimit: true,
      sendInvitation: false,
      updatedAt: third?.updatedAt,
    })
    expect(beyond.status, JSON.stringify(beyond.body)).toBe(200)

    // --- A rollover closes Orliki: its waiting application goes back to New, flagged "group closed" ---
    const ewa = await createPerson(request, admin, { firstName: 'Ewa', lastName: 'Pełna', birthDate: '2015-01-01' })
    await addMembership(request, admin, { groupId: orliki, personId: ewa, role: 'participant', validFrom: today })
    await confirmedApplication(
      clubSlug,
      sectionSlug,
      childApplication(`o1-${tag}@example.test`, {
        participantFirstName: 'Hania',
        participantBirthDate: '2015-04-04',
        groupId: orliki,
        chooseForUs: false,
      }),
    )
    expect(await applicationIn(request, admin, 'waiting', 'Hania Nowak')).toBeTruthy()
    const plan = {
      fromSeasonId: season,
      season: { name: `Sezon J09 nowy ${tag}`, startsOn: addDays(today, 31), endsOn: addDays(today, 395) },
      groups: [{ groupId: orliki, action: 'close' }],
      records: [],
    }
    const previewed = await call<{ previewToken?: string }>(
      request,
      'POST',
      '/api/groups/seasons/rollover/preview',
      admin,
      { data: plan },
    )
    expect(previewed.status, JSON.stringify(previewed.body)).toBe(200)
    const rolled = await call(request, 'POST', '/api/groups/seasons/rollover', admin, {
      data: { ...plan, previewToken: previewed.body?.previewToken },
    })
    expect(rolled.status, JSON.stringify(rolled.body)).toBe(200)
    await expect
      .poll(async () => (await applicationIn(request, admin, 'new', 'Hania Nowak'))?.flags ?? [])
      .toContain('group_closed')
    expect(await applicationIn(request, admin, 'waiting', 'Hania Nowak')).toBeUndefined()
    await expect.poll(async () => (await notificationRows(club, 'enrolment.group_closed')).length).toBeGreaterThan(0)
  } finally {
    await club.cleanup()
  }
})
