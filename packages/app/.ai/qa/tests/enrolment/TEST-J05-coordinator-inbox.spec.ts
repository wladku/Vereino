import { expect, test } from '@playwright/test'
import { expectNoPageOverflow, scanInColorSchemes } from '../_fixtures/axe'
import { calendarDate, call, createClub, createPerson, uniqueSuffix } from '../_fixtures/club'
import { create as createStructure, signInBrowser } from '../_fixtures/club-structure'
import {
  applicationDetail,
  applicationIn,
  backdateConfirmation,
  childApplication,
  confirmedApplication,
  createGroup,
  listApplications,
  openApplications,
} from '../_fixtures/enrolment'
import { addMembership, signedInStaff } from '../_fixtures/groups'

// TEST-J05 (section sign-up form spec phase 2, E26-S03 #799; REQ-J10, REQ-J11, REQ-J17, BR-J5, AC-J06): confirmed
// applications reach the coordinators of their section; a section without a coordinator reaches the club
// administrators. The coordinator sees only the own section's applications (another id answers 404, like an unknown
// one); the administrator sees both sections and the number past the answer time (the dashboard's count, which the
// coordinator may not read). Flags: outside the age range, group full, wants a trial session, possible duplicate
// (the guardian's e-mail belongs to an adult of the club) and overdue.
test.describe.configure({ timeout: 600_000 })

test('TEST-J05 coordinator inbox, administrator view and flags', async ({ page, request }, testInfo) => {
  const club = await createClub(request, 'test-j05-inbox')
  try {
    const admin = club.adminToken
    const tag = uniqueSuffix()
    const clubSlug = `j05-${tag}`
    const football = await createStructure(request, admin, 'sections', { name: 'Piłka nożna J05' })
    const chess = await createStructure(request, admin, 'sections', { name: 'Szachy J05' })
    const zaki = await createGroup(request, admin, {
      sectionId: football,
      name: 'Żaki',
      kind: 'class_group',
      ageFrom: 7,
      ageTo: 9,
    })
    const full = await createGroup(request, admin, {
      sectionId: football,
      name: 'Orliki pełne',
      kind: 'class_group',
      ageFrom: 10,
      ageTo: 11,
      placesLimit: 1,
    })
    const member = await createPerson(request, admin, { firstName: 'Jan', lastName: 'Gracz', birthDate: '2015-05-01' })
    await addMembership(request, admin, {
      groupId: full,
      personId: member,
      role: 'participant',
      validFrom: calendarDate(-30),
    })
    const knights = await createGroup(request, admin, { sectionId: chess, name: 'Skoczki', kind: 'class_group' })
    await openApplications(request, club, {
      clubSlug,
      sectionId: football,
      sectionSlug: `pilka-${tag}`,
      groupIds: [zaki, full],
    })
    await openApplications(request, club, {
      clubSlug,
      sectionId: chess,
      sectionSlug: `szachy-${tag}`,
      groupIds: [knights],
    })
    const coordinator = await signedInStaff(request, club, {
      firstName: 'Kacper',
      lastName: 'Koordynator',
      role: 'coordinator',
      sectionId: football,
    })
    const ewa = `ewa-${tag}@example.test`
    await createPerson(request, admin, { firstName: 'Ewa', lastName: 'Rodzic', birthDate: '1985-02-02', email: ewa })

    // Football: outside the age range in a full group (→ waiting), a duplicate guardian; chess: no coordinator.
    await confirmedApplication(
      clubSlug,
      `pilka-${tag}`,
      childApplication(`anna-${tag}@example.test`, { groupId: full, chooseForUs: false }),
    )
    await confirmedApplication(
      clubSlug,
      `pilka-${tag}`,
      childApplication(ewa, {
        participantFirstName: 'Staś',
        guardianFirstName: 'Ewa',
        guardianLastName: 'Rodzic',
        groupId: zaki,
        chooseForUs: false,
        wantsTrial: false,
      }),
    )
    await confirmedApplication(
      clubSlug,
      `szachy-${tag}`,
      childApplication(`piotr-${tag}@example.test`, { participantFirstName: 'Piotr', participantLastName: 'Wieża' }),
    )

    const coordinatorNew = await listApplications(request, coordinator.token, { tab: 'new' })
    expect(coordinatorNew.status, JSON.stringify(coordinatorNew.body)).toBe(200)
    expect(coordinatorNew.body?.items.map((item) => item.participantName)).toEqual(['Staś Nowak'])
    const coordinatorWaiting = await listApplications(request, coordinator.token, { tab: 'waiting' })
    const ola = coordinatorWaiting.body?.items[0]
    expect(ola).toMatchObject({ participantName: 'Ola Nowak', waitingNumber: 1, groupId: full })
    expect(ola?.flags).toEqual(expect.arrayContaining(['outside_age', 'group_full', 'wants_trial']))
    await expect
      .poll(async () => (await applicationIn(request, coordinator.token, 'new', 'Staś Nowak'))?.flags ?? [])
      .toContain('possible_duplicate')

    const piotr = await applicationIn(request, admin, 'new', 'Piotr Wieża')
    expect(piotr).toBeTruthy()
    const foreign = await applicationDetail(request, coordinator.token, String(piotr?.id))
    expect(foreign.status).toBe(404)
    const filtered = await listApplications(request, coordinator.token, { tab: 'new', sectionId: chess })
    expect(filtered.body?.total).toBe(0)
    const adminNew = await listApplications(request, admin, { tab: 'new' })
    expect(adminNew.body?.items.map((item) => item.participantName).sort()).toEqual(['Piotr Wieża', 'Staś Nowak'])

    const stas = await applicationIn(request, admin, 'new', 'Staś Nowak')
    const detail = await applicationDetail(request, coordinator.token, String(stas?.id))
    expect(detail.status).toBe(200)
    expect(detail.body).toMatchObject({ email: ewa, guardianFirstName: 'Ewa', ageFit: 'fits', canDecide: true })
    expect((detail.body?.duplicates as { role: string; reason: string }[])[0]).toMatchObject({
      role: 'guardian',
      reason: 'email',
      name: expect.stringContaining('Ewa'),
    })

    // Past the answer time (7 days).
    await backdateConfirmation(club, String(piotr?.id), 8)
    const overdue = await call<{ count?: number }>(request, 'GET', '/api/enrolment/overdue', admin)
    expect(overdue.body?.count).toBe(1)
    expect((await applicationIn(request, admin, 'new', 'Piotr Wieża'))?.flags).toContain('overdue')
    const filteredOverdue = await listApplications(request, admin, { tab: 'new', overdue: '1' })
    expect(filteredOverdue.body?.items.map((item) => item.participantName)).toEqual(['Piotr Wieża'])
    const notForCoordinator = await call(request, 'GET', '/api/enrolment/overdue', coordinator.token)
    expect(notForCoordinator.status).toBe(403)

    // On the phone: the Today tile, the list with its flags and the application (375 px, en/pl, light/dark).
    await signInBrowser(page, request, club, coordinator.userId, coordinator.email)
    await page.setViewportSize({ width: 375, height: 812 })
    const violations: Record<string, unknown> = {}
    for (const locale of ['en', 'pl'] as const) {
      await page
        .context()
        .addCookies([{ name: 'locale', value: locale, url: process.env.BASE_URL || 'http://localhost:3000' }])
      await page.goto('/club')
      await expect(page.getByTestId('club-today-applications-tile')).toBeVisible()
      await page.goto('/club/applications?tab=waiting')
      const row = page.getByTestId('enrolment-row').filter({ hasText: 'Ola Nowak' })
      await expect(row).toBeVisible()
      await expect(row.getByTestId('enrolment-flag-outside_age')).toBeVisible()
      await expect(row.getByTestId('enrolment-waiting-number')).toContainText('1')
      await expectNoPageOverflow(page, 375)
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, `/club/applications (${locale})`, async () => {
          await expect(row).toBeVisible()
        }),
      )
      await page.goto(`/club/applications/${String(stas?.id)}`)
      await expect(page.getByTestId('enrolment-application')).toBeVisible()
      await expect(page.getByTestId('enrolment-action-reject')).toBeVisible()
      // Delegated acceptance (#800): the section's coordinator is offered Accept too.
      await expect(page.getByTestId('enrolment-action-accept')).toBeVisible()
      await expectNoPageOverflow(page, 375)
      Object.assign(
        violations,
        await scanInColorSchemes(page, testInfo, `/club/applications/[id] (${locale})`, async () => {
          await expect(page.getByTestId('enrolment-application')).toBeVisible()
        }),
      )
    }
    expect(violations).toEqual({})
  } finally {
    await club.cleanup()
  }
})
