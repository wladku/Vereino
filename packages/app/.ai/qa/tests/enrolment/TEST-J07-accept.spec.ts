import { expect, test } from '@playwright/test'
import { calendarDate, call, createClub, createPerson, getPerson, uniqueSuffix } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { awaitEmails } from '../_fixtures/communication'
import {
  acceptApplication,
  acceptedRow,
  applicationDetail,
  applicationIn,
  childApplication,
  confirmedApplication,
  createGroup,
  openApplications,
} from '../_fixtures/enrolment'
import { addMembership, roster, signedInStaff } from '../_fixtures/groups'
import { guardianships } from '../_fixtures/people'

// TEST-J07 (section sign-up form spec phase 3, E26-S04 #800; REQ-J12, REQ-J13, DD-J10, DD-J11, Q-J08, AC-J07, AC-J08):
// accepting puts a family in the club in one step. A new family becomes two persons with the guardianship (the guardian
// the primary payer) and the child's membership from the start day; the applicant gets the acceptance e-mail and the
// guardian, whose birth date the decider gives on the sheet, the account invitation after the commit. A second child of
// the same guardian (same e-mail) reuses the guardian, so no second guardian is created. A child already in the club
// (same name and birth date) is reused; accepting it into the group it is already in answers 409
// `participant_already_in_group`. Only a possible duplicate may be reused (422). Delegated acceptance (#800): the section's
// coordinator accepts the new family — the persons and the guardianship are written in the club's job context — while
// creating a person directly stays refused to the coordinator.
test.describe.configure({ timeout: 360_000 })

type Duplicate = { personId: string; role: string; reason: string; name: string | null; hasAccount: boolean }

test('TEST-J07 accept a new family, reuse a guardian and a child', async ({ request }) => {
  const club = await createClub(request, 'test-j07-accept')
  try {
    const admin = club.adminToken
    const tag = uniqueSuffix()
    const clubSlug = `j07-${tag}`
    const sectionSlug = `pilka-${tag}`
    const today = calendarDate()
    const section = await createStructure(request, admin, 'sections', { name: 'Piłka nożna J07' })
    const zaki = await createGroup(request, admin, {
      sectionId: section,
      name: 'Żaki',
      kind: 'class_group',
      ageFrom: 7,
      ageTo: 9,
    })
    const orliki = await createGroup(request, admin, {
      sectionId: section,
      name: 'Orliki',
      kind: 'class_group',
      ageFrom: 10,
      ageTo: 11,
    })
    await openApplications(request, club, { clubSlug, sectionId: section, sectionSlug, groupIds: [zaki, orliki] })

    // --- A new family ---
    const anna = `anna-${tag}@example.test`
    await confirmedApplication(
      clubSlug,
      sectionSlug,
      childApplication(anna, { groupId: zaki, chooseForUs: false, note: 'Likes goalkeeping' }),
    )
    const ola = await applicationIn(request, admin, 'new', 'Ola Nowak')
    expect(ola).toBeTruthy()
    const olaId = String(ola?.id)
    const noBirthDate = await acceptApplication(request, admin, olaId, {
      groupId: zaki,
      startDay: today,
      updatedAt: ola?.updatedAt,
    })
    expect(noBirthDate.status, JSON.stringify(noBirthDate.body)).toBe(422)
    expect(noBirthDate.body?.code).toBe('invitation_birth_date_required')
    const pastDay = await acceptApplication(request, admin, olaId, {
      groupId: zaki,
      startDay: calendarDate(-1),
      sendInvitation: false,
      updatedAt: ola?.updatedAt,
    })
    expect(pastDay.status, JSON.stringify(pastDay.body)).toBe(422)
    expect(pastDay.body?.code).toBe('start_day_invalid')

    const coordinator = await signedInStaff(request, club, {
      firstName: 'Kacper',
      lastName: `Koordynator${tag}`,
      role: 'coordinator',
      sectionId: section,
    })
    // No new right outside the accept flow: the coordinator still cannot create a club person directly.
    const direct = await call(request, 'POST', '/api/people/persons', coordinator.token, {
      data: { firstName: 'Not', lastName: `Allowed${tag}` },
    })
    expect(direct.status, JSON.stringify(direct.body)).toBe(403)

    const accepted = await acceptApplication(request, coordinator.token, olaId, {
      groupId: zaki,
      startDay: today,
      guardian: { birthDate: '1988-05-01' },
      updatedAt: ola?.updatedAt,
    })
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200)
    expect(accepted.body).toMatchObject({ state: 'accepted', invitation: 'sent' })
    const childId = String(accepted.body?.participantPersonId)
    const guardianId = String(accepted.body?.guardianPersonId)
    expect((await getPerson(request, admin, childId)).body).toMatchObject({
      firstName: 'Ola',
      lastName: 'Nowak',
      birthDate: '2017-03-14',
    })
    expect((await getPerson(request, admin, guardianId)).body).toMatchObject({
      firstName: 'Anna',
      lastName: 'Nowak',
      email: anna,
      birthDate: '1988-05-01',
    })
    const links = await guardianships(request, admin, `wardPersonId=${childId}`)
    expect(links.items).toHaveLength(1)
    expect(links.items[0]).toMatchObject({ guardianPersonId: guardianId, isPrimaryPayer: true })
    const zakiRoster = await roster(request, admin, zaki)
    expect(zakiRoster.items.find((item) => item.personId === childId)).toMatchObject({
      role: 'participant',
      validFrom: today,
    })
    const stored = await acceptedRow(club, olaId)
    expect(stored).toMatchObject({
      state: 'accepted',
      note: null,
      accepted_child_person_id: childId,
      accepted_guardian_person_id: guardianId,
      accepted_membership_id: accepted.body?.membershipId,
      decided_by_user_id: coordinator.userId,
    })
    const welcome = await awaitEmails(anna, 'Welcome to Piłka nożna J07')
    expect(welcome[0].text).toContain('Żaki')
    // The invitation runs after the commit: the guardian gets an account.
    await expect
      .poll(async () => (await getPerson(request, admin, guardianId)).body?.userId ?? null, { timeout: 30_000 })
      .not.toBeNull()
    club.extraUserIds.push(String((await getPerson(request, admin, guardianId)).body?.userId))
    expect(await applicationIn(request, admin, 'closed', 'Ola Nowak')).toMatchObject({ state: 'accepted' })

    // --- The same guardian's second child: the guardian is reused ---
    await confirmedApplication(
      clubSlug,
      sectionSlug,
      childApplication(anna, {
        participantFirstName: 'Kuba',
        participantLastName: 'Nowak',
        participantBirthDate: '2018-05-05',
      }),
    )
    const kuba = await applicationIn(request, admin, 'new', 'Kuba Nowak')
    expect(kuba).toBeTruthy()
    let duplicates: Duplicate[] = []
    await expect
      .poll(async () => {
        duplicates = ((await applicationDetail(request, admin, String(kuba?.id))).body?.duplicates ?? []) as Duplicate[]
        return duplicates.filter((entry) => entry.role === 'guardian').map((entry) => entry.personId)
      })
      .toContain(guardianId)
    expect(duplicates.find((entry) => entry.personId === guardianId)).toMatchObject({
      name: 'Anna Nowak',
      hasAccount: true,
    })
    const kubaFresh = await applicationDetail(request, admin, String(kuba?.id))
    const notCandidate = await acceptApplication(request, admin, String(kuba?.id), {
      groupId: zaki,
      startDay: today,
      child: { personId: guardianId },
      sendInvitation: false,
      updatedAt: kubaFresh.body?.updatedAt,
    })
    expect(notCandidate.status, JSON.stringify(notCandidate.body)).toBe(422)
    expect(notCandidate.body?.code).toBe('accept_person_invalid')
    const second = await acceptApplication(request, admin, String(kuba?.id), {
      groupId: zaki,
      startDay: today,
      guardian: { personId: guardianId },
      updatedAt: kubaFresh.body?.updatedAt,
    })
    expect(second.status, JSON.stringify(second.body)).toBe(200)
    // The guardian already has an account, so no second invitation.
    expect(second.body).toMatchObject({ guardianPersonId: guardianId, invitation: 'skipped' })
    const wards = await guardianships(request, admin, `guardianPersonId=${guardianId}`)
    expect(wards.items.map((item) => item.wardPersonId).sort()).toEqual(
      [childId, String(second.body?.participantPersonId)].sort(),
    )

    // --- A child already in the club: reused, never twice in a group ---
    const zosia = await createPerson(request, admin, { firstName: 'Zosia', lastName: 'Kowal', birthDate: '2017-06-01' })
    await addMembership(request, admin, { groupId: zaki, personId: zosia, role: 'participant', validFrom: today })
    const marta = `marta-${tag}@example.test`
    await confirmedApplication(
      clubSlug,
      sectionSlug,
      childApplication(marta, {
        participantFirstName: 'Zosia',
        participantLastName: 'Kowal',
        participantBirthDate: '2017-06-01',
        guardianFirstName: 'Marta',
        guardianLastName: 'Kowal',
        phone: '600 300 400',
      }),
    )
    const zosiaApp = await applicationIn(request, admin, 'new', 'Zosia Kowal')
    await expect
      .poll(async () =>
        (((await applicationDetail(request, admin, String(zosiaApp?.id))).body?.duplicates ?? []) as Duplicate[])
          .filter((entry) => entry.role === 'participant')
          .map((entry) => entry.personId),
      )
      .toContain(zosia)
    const zosiaFresh = await applicationDetail(request, admin, String(zosiaApp?.id))
    const overlap = await acceptApplication(request, admin, String(zosiaApp?.id), {
      groupId: zaki,
      startDay: today,
      child: { personId: zosia },
      sendInvitation: false,
      updatedAt: zosiaFresh.body?.updatedAt,
    })
    expect(overlap.status, JSON.stringify(overlap.body)).toBe(409)
    expect(overlap.body?.code).toBe('participant_already_in_group')
    // The refused acceptance rolled back: no guardian was created and the application is still open.
    expect((await acceptedRow(club, String(zosiaApp?.id))).state).toBe('new')
    const intoOrliki = await acceptApplication(request, admin, String(zosiaApp?.id), {
      groupId: orliki,
      startDay: today,
      child: { personId: zosia },
      sendInvitation: false,
      updatedAt: zosiaFresh.body?.updatedAt,
    })
    expect(intoOrliki.status, JSON.stringify(intoOrliki.body)).toBe(200)
    expect(intoOrliki.body).toMatchObject({ participantPersonId: zosia, invitation: 'skipped' })
    const marthaLinks = await guardianships(request, admin, `wardPersonId=${zosia}`)
    expect(marthaLinks.items).toHaveLength(1)
    expect(marthaLinks.items[0]).toMatchObject({ isPrimaryPayer: true })
  } finally {
    await club.cleanup()
  }
})
